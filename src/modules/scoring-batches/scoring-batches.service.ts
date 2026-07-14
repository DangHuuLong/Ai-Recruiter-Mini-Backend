import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';

import { CreateScoringBatchDto } from './dto/create-scoring-batch.dto';
import { CreateUploadUrlsDto } from './dto/create-upload-urls.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { DEFAULT_MAX_FILE_SIZE_MB } from '../../common/constants/upload.constants';
import {
  getUploadFileExtension,
  isAllowedUploadMimeType,
  isFileSizeAllowed,
  resolveResumeFileType,
} from '../../common/utils/upload-file.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import { SupabaseStorageService } from '../../integrations/storage/supabase-storage.service';
import { JdParseJobData, ResumeParseJobData } from '../../queue/jobs/job-payloads.types';
import { QUEUE_NAMES } from '../../queue/queue.constants';

const SIGNED_UPLOAD_URL_EXPIRES_IN_SECONDS = 600;
const JOB_RETRY_OPTIONS = { attempts: 3, backoff: { type: 'exponential' as const, delay: 2000 } };

@Injectable()
export class ScoringBatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly storageService: SupabaseStorageService,
    @InjectQueue(QUEUE_NAMES.RESUME_PARSE) private readonly resumeParseQueue: Queue<ResumeParseJobData>,
    @InjectQueue(QUEUE_NAMES.JD_PARSE) private readonly jdParseQueue: Queue<JdParseJobData>,
  ) {}

  async createUploadUrls(dto: CreateUploadUrlsDto, organizationId: string) {
    const maxFiles = this.configService.get<number>('ENTERPRISE_MAX_FILES_PER_BATCH') ?? 2000;
    const maxFileSizeMb =
      this.configService.get<number>('MAX_FILE_SIZE_MB') ?? DEFAULT_MAX_FILE_SIZE_MB;

    if (dto.files.length > maxFiles) {
      throw new AppException(`Batch exceeds the maximum of ${maxFiles} files`, 400);
    }

    const bucket = this.storageService.getDefaultBucket();

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

        const fileKey = `scoring-batches/${organizationId}/${randomUUID()}.${extension}`;
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

  async create(dto: CreateScoringBatchDto, organizationId: string, userId: string) {
    const maxJds = this.configService.get<number>('ENTERPRISE_MAX_JDS_PER_BATCH') ?? 50;

    if (dto.jobDescriptions.length > maxJds) {
      throw new AppException(`Batch exceeds the maximum of ${maxJds} job descriptions`, 400);
    }

    if (dto.evaluationConfigId) {
      const config = await this.prisma.evaluationConfig.findFirst({
        where: { id: dto.evaluationConfigId, organizationId },
        select: { id: true },
      });

      if (!config) {
        throw new AppException('Evaluation config not found', 404);
      }
    }

    const bucket = this.storageService.getDefaultBucket();

    const fileAssets = await Promise.all(
      dto.resumeFiles.map(async (ref) => {
        const exists = await this.storageService.objectExists(ref.fileKey, bucket);

        if (!exists) {
          throw new AppException(`Uploaded file not found: ${ref.fileKey}`, 400);
        }

        let fileType;
        try {
          fileType = resolveResumeFileType(ref.mimeType);
        } catch {
          throw new AppException(`Unsupported file type: ${ref.mimeType}`, 400);
        }

        return this.prisma.fileAsset.create({
          data: {
            organizationId,
            fileName: ref.fileName,
            originalFileUrl: this.storageService.getPublicUrl(ref.fileKey, bucket),
            storageKey: ref.fileKey,
            fileType,
            fileSizeBytes: ref.sizeBytes,
            checksum: ref.checksum,
            bucket,
            status: 'ACTIVE',
          },
        });
      }),
    );

    const { batch, resumeItems, jdItems } = await this.prisma.$transaction(async (tx) => {
      const createdBatch = await tx.scoringBatch.create({
        data: {
          organizationId,
          createdById: userId,
          name: dto.name,
          status: 'PENDING',
          evaluationConfigId: dto.evaluationConfigId,
          totalCvCount: fileAssets.length,
          totalJdCount: dto.jobDescriptions.length,
          notifyWebhookUrl: dto.notifyWebhookUrl,
          notifyEmail: dto.notifyEmail,
        },
      });

      const createdResumeItems = await Promise.all(
        fileAssets.map((fa) =>
          tx.scoringBatchResume.create({
            data: {
              batchId: createdBatch.id,
              fileAssetId: fa.id,
              checksum: fa.checksum,
              candidateLabel: fa.fileName,
              status: 'PENDING',
            },
          }),
        ),
      );

      const createdJdItems = await Promise.all(
        dto.jobDescriptions.map((jd) =>
          tx.scoringBatchJobDescription.create({
            data: {
              batchId: createdBatch.id,
              label: jd.label,
              rawText: jd.rawText,
              status: 'PENDING',
            },
          }),
        ),
      );

      await tx.scoringBatch.update({
        where: { id: createdBatch.id },
        data: { status: 'PARSING', startedAt: new Date() },
      });

      return { batch: createdBatch, resumeItems: createdResumeItems, jdItems: createdJdItems };
    });

    await Promise.all([
      ...resumeItems.map((item, index) => {
        const fa = fileAssets[index];

        return this.resumeParseQueue.add(
          'resume-parse',
          {
            batchId: batch.id,
            tier: 'ENTERPRISE',
            resumeItemId: item.id,
            storageKey: fa.storageKey,
            bucket: fa.bucket,
            fileName: fa.fileName,
            fileType: fa.fileType,
            checksum: fa.checksum,
            organizationId,
          },
          JOB_RETRY_OPTIONS,
        );
      }),
      ...jdItems.map((item) =>
        this.jdParseQueue.add(
          'jd-parse',
          { batchId: batch.id, tier: 'ENTERPRISE', jdItemId: item.id, rawText: item.rawText },
          JOB_RETRY_OPTIONS,
        ),
      ),
    ]);

    return {
      batchId: batch.id,
      status: 'PARSING' as const,
      totalCvCount: resumeItems.length,
      totalJdCount: jdItems.length,
    };
  }
}
