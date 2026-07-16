import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';

import { CreatePublicBatchDto } from './dto/create-public-batch.dto';
import { RedisBatchContextStore } from './redis-batch-context.store';
import { AppException } from '../../common/exceptions/app.exception';
import { DEFAULT_MAX_FILE_SIZE_MB } from '../../common/constants/upload.constants';
import {
  getUploadFileExtension,
  isAllowedUploadMimeType,
  isFileSizeAllowed,
  resolveResumeFileType,
} from '../../common/utils/upload-file.util';
import { SupabaseStorageService } from '../../integrations/storage/supabase-storage.service';
import { BatchProgressCoordinatorService } from '../../queue/batch-progress-coordinator.service';
import { JdParseJobData, ResumeParseJobData } from '../../queue/jobs/job-payloads.types';
import { QUEUE_NAMES } from '../../queue/queue.constants';
import { CreateUploadUrlsDto } from '../scoring-batches/dto/create-upload-urls.dto';
import { JobDescriptionFileRefDto } from '../scoring-batches/dto/job-description-file-ref.dto';
import { ResumeFileRefDto } from '../scoring-batches/dto/resume-file-ref.dto';
import { mapStructuredJdToParsedData } from '../scoring-batches/job-description-structured.mapper';
import { mapStructuredResumeToParsedData } from '../scoring-batches/resume-structured.mapper';

const SIGNED_UPLOAD_URL_EXPIRES_IN_SECONDS = 600;
const JOB_RETRY_OPTIONS = { attempts: 3, backoff: { type: 'exponential' as const, delay: 2000 } };

@Injectable()
export class PublicBatchesService {
  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: SupabaseStorageService,
    private readonly redisStore: RedisBatchContextStore,
    private readonly coordinator: BatchProgressCoordinatorService,
    @InjectQueue(QUEUE_NAMES.RESUME_PARSE) private readonly resumeParseQueue: Queue<ResumeParseJobData>,
    @InjectQueue(QUEUE_NAMES.JD_PARSE) private readonly jdParseQueue: Queue<JdParseJobData>,
  ) {}

  async createUploadUrls(dto: CreateUploadUrlsDto, sessionId: string) {
    const maxFiles = this.configService.get<number>('PUBLIC_MAX_FILES_PER_BATCH') ?? 2;
    const maxFileSizeMb =
      this.configService.get<number>('MAX_FILE_SIZE_MB') ?? DEFAULT_MAX_FILE_SIZE_MB;

    if (dto.files.length > maxFiles) {
      throw new AppException(`Batch exceeds the maximum of ${maxFiles} files`, 400);
    }

    const bucket = this.getPublicBucket();

    return Promise.all(
      dto.files.map(async (file) => {
        if (!isAllowedUploadMimeType(file.mimeType)) {
          throw new AppException(`Unsupported file type: ${file.mimeType}`, 400);
        }

        if (!isFileSizeAllowed(file.sizeBytes, maxFileSizeMb)) {
          throw new AppException(`File ${file.fileName} exceeds the ${maxFileSizeMb}MB limit`, 400);
        }

        let extension: string;
        try {
          extension = getUploadFileExtension(file.fileName);
        } catch {
          throw new AppException(`Unsupported file extension: ${file.fileName}`, 400);
        }

        const fileKey = `public/${sessionId}/${randomUUID()}.${extension}`;
        const signedUploadUrl = await this.storageService.createSignedUploadUrl(fileKey, bucket);

        return {
          fileKey,
          fileName: file.fileName,
          signedUploadUrl,
          expiresIn: SIGNED_UPLOAD_URL_EXPIRES_IN_SECONDS,
        };
      }),
    );
  }

  async create(dto: CreatePublicBatchDto, sessionId: string) {
    const resumeFiles = dto.resumeFiles ?? [];
    const resumeTexts = dto.resumeTexts ?? [];
    const resumeStructured = dto.resumeStructured ?? [];
    const jobDescriptions = dto.jobDescriptions ?? [];
    const jobDescriptionFiles = dto.jobDescriptionFiles ?? [];
    const jobDescriptionStructured = dto.jobDescriptionStructured ?? [];

    const totalCvCount = resumeFiles.length + resumeTexts.length + resumeStructured.length;
    const totalJdCount =
      jobDescriptions.length + jobDescriptionFiles.length + jobDescriptionStructured.length;

    if (totalCvCount === 0) {
      throw new AppException('At least one resume (file, text, or structured) is required', 400);
    }

    if (totalJdCount === 0) {
      throw new AppException(
        'At least one job description (file, text, or structured) is required',
        400,
      );
    }

    const maxFiles = this.configService.get<number>('PUBLIC_MAX_FILES_PER_BATCH') ?? 2;
    if (totalCvCount > maxFiles) {
      throw new AppException(`Batch exceeds the maximum of ${maxFiles} resumes for public batches`, 400);
    }

    const maxJds = this.configService.get<number>('PUBLIC_MAX_JDS_PER_BATCH') ?? 10;
    if (totalJdCount > maxJds) {
      throw new AppException(
        `Batch exceeds the maximum of ${maxJds} job descriptions for public batches`,
        400,
      );
    }

    const bucket = this.getPublicBucket();

    // No FileAsset row — public batches never touch Postgres.
    const [resumeFileTypes, jdFileTypes] = await Promise.all([
      Promise.all(resumeFiles.map((ref) => this.verifyFileRef(ref, bucket))),
      Promise.all(jobDescriptionFiles.map((ref) => this.verifyFileRef(ref, bucket))),
    ]);

    const batchId = randomUUID();

    await this.redisStore.createBatch({
      id: batchId,
      ownerSessionId: sessionId,
      name: dto.name,
      totalCvCount,
      totalJdCount,
      notifyWebhookUrl: dto.notifyWebhookUrl,
      notifyEmail: dto.notifyEmail,
    });

    const resumeFileItems = await Promise.all(
      resumeFiles.map(async (ref, index) => {
        const id = randomUUID();
        await this.redisStore.addResumeItem(batchId, {
          id,
          status: 'PENDING',
          candidateLabel: ref.fileName,
          checksum: ref.checksum ?? null,
        });
        return { id, ref, fileType: resumeFileTypes[index] };
      }),
    );

    const resumeTextItems = await Promise.all(
      resumeTexts.map(async (input) => {
        const id = randomUUID();
        await this.redisStore.addResumeItem(batchId, {
          id,
          status: 'PENDING',
          candidateLabel: input.label ?? null,
          rawText: input.rawText,
        });
        return { id, rawText: input.rawText };
      }),
    );

    await Promise.all(
      resumeStructured.map(async (input) => {
        const parsedData = mapStructuredResumeToParsedData(input);
        const id = randomUUID();
        await this.redisStore.addResumeItem(batchId, {
          id,
          status: 'SUCCESS',
          candidateLabel: input.label ?? parsedData.personal.full_name ?? null,
          parsedData,
        });
      }),
    );

    const jdTextItems = await Promise.all(
      jobDescriptions.map(async (jd) => {
        const id = randomUUID();
        await this.redisStore.addJdItem(batchId, {
          id,
          status: 'PENDING',
          label: jd.label ?? null,
          rawText: jd.rawText,
        });
        return { id, rawText: jd.rawText };
      }),
    );

    const jdFileItems = await Promise.all(
      jobDescriptionFiles.map(async (ref, index) => {
        const id = randomUUID();
        await this.redisStore.addJdItem(batchId, {
          id,
          status: 'PENDING',
          label: ref.label ?? ref.fileName,
        });
        return { id, ref, fileType: jdFileTypes[index] };
      }),
    );

    await Promise.all(
      jobDescriptionStructured.map(async (input) => {
        const parsedData = mapStructuredJdToParsedData(input);
        const id = randomUUID();
        await this.redisStore.addJdItem(batchId, {
          id,
          status: 'SUCCESS',
          label: input.label ?? parsedData.title ?? null,
          parsedData,
        });
      }),
    );

    await this.redisStore.markBatchStatus(batchId, 'PARSING');

    await Promise.all([
      ...resumeFileItems.map(({ id, ref, fileType }) =>
        this.resumeParseQueue.add(
          'resume-parse',
          {
            batchId,
            tier: 'PUBLIC',
            resumeItemId: id,
            storageKey: ref.fileKey,
            bucket,
            fileName: ref.fileName,
            fileType,
            checksum: ref.checksum,
            sessionId,
          },
          JOB_RETRY_OPTIONS,
        ),
      ),
      ...resumeTextItems.map(({ id, rawText }) =>
        this.resumeParseQueue.add(
          'resume-parse',
          { batchId, tier: 'PUBLIC', resumeItemId: id, rawText, sessionId },
          JOB_RETRY_OPTIONS,
        ),
      ),
      ...jdTextItems.map(({ id, rawText }) =>
        this.jdParseQueue.add(
          'jd-parse',
          { batchId, tier: 'PUBLIC', jdItemId: id, rawText },
          JOB_RETRY_OPTIONS,
        ),
      ),
      ...jdFileItems.map(({ id, ref, fileType }) =>
        this.jdParseQueue.add(
          'jd-parse',
          {
            batchId,
            tier: 'PUBLIC',
            jdItemId: id,
            storageKey: ref.fileKey,
            bucket,
            fileName: ref.fileName,
            fileType,
          },
          JOB_RETRY_OPTIONS,
        ),
      ),
    ]);

    await this.coordinator.checkParseCompletion(batchId, 'PUBLIC');

    return {
      batchId,
      status: 'PARSING' as const,
      totalCvCount,
      totalJdCount,
    };
  }

  async findOne(batchId: string, sessionId: string) {
    const snapshot = await this.redisStore.getBatchSnapshot(batchId);

    // 404 (not 403) on session mismatch — doesn't leak whether the batch id exists.
    if (!snapshot || snapshot.meta.ownerSessionId !== sessionId) {
      throw new AppException('Batch not found', 404);
    }

    return {
      batchId: snapshot.meta.id,
      name: snapshot.meta.name,
      status: snapshot.meta.status,
      progress: {
        totalCvCount: snapshot.meta.totalCvCount,
        totalJdCount: snapshot.meta.totalJdCount,
        totalPairCount: snapshot.meta.totalPairCount,
        completedPairCount: snapshot.meta.completedPairCount,
        failedPairCount: snapshot.meta.failedPairCount,
      },
      startedAt: snapshot.meta.startedAt,
      completedAt: snapshot.meta.completedAt,
      resumeItems: snapshot.resumeItems,
      jdItems: snapshot.jdItems,
      results: snapshot.results,
    };
  }

  private getPublicBucket(): string {
    return this.configService.get<string>('supabase.publicTempBucket') ?? 'file-public';
  }

  private async verifyFileRef(
    ref: ResumeFileRefDto | JobDescriptionFileRefDto,
    bucket: string,
  ): Promise<string> {
    const exists = await this.storageService.objectExists(ref.fileKey, bucket);

    if (!exists) {
      throw new AppException(`Uploaded file not found: ${ref.fileKey}`, 400);
    }

    try {
      return resolveResumeFileType(ref.mimeType);
    } catch {
      throw new AppException(`Unsupported file type: ${ref.mimeType}`, 400);
    }
  }
}
