import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';

import { CreateScoringBatchDto } from './dto/create-scoring-batch.dto';
import { CreateUploadUrlsDto } from './dto/create-upload-urls.dto';
import { ResumeStructuredInputDto } from './dto/resume-structured-input.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { DEFAULT_MAX_FILE_SIZE_MB } from '../../common/constants/upload.constants';
import { ParsedResumeData } from '../../common/types/ai-service.types';
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
    const resumeFiles = dto.resumeFiles ?? [];
    const resumeTexts = dto.resumeTexts ?? [];
    const resumeStructured = dto.resumeStructured ?? [];
    const jobDescriptions = dto.jobDescriptions ?? [];
    const jobDescriptionFiles = dto.jobDescriptionFiles ?? [];

    if (resumeFiles.length + resumeTexts.length + resumeStructured.length === 0) {
      throw new AppException('At least one resume (file, text, or structured) is required', 400);
    }

    if (jobDescriptions.length + jobDescriptionFiles.length === 0) {
      throw new AppException('At least one job description (file or text) is required', 400);
    }

    const maxJds = this.configService.get<number>('ENTERPRISE_MAX_JDS_PER_BATCH') ?? 50;

    if (jobDescriptions.length + jobDescriptionFiles.length > maxJds) {
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

    const createFileAsset = async (ref: {
      fileKey: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      checksum?: string;
    }) => {
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
    };

    const [resumeFileAssets, jdFileAssets] = await Promise.all([
      Promise.all(resumeFiles.map(createFileAsset)),
      Promise.all(jobDescriptionFiles.map(createFileAsset)),
    ]);

    const { batch, resumeItems, jdItems } = await this.prisma.$transaction(async (tx) => {
      const createdBatch = await tx.scoringBatch.create({
        data: {
          organizationId,
          createdById: userId,
          name: dto.name,
          status: 'PENDING',
          evaluationConfigId: dto.evaluationConfigId,
          totalCvCount: resumeFileAssets.length + resumeTexts.length + resumeStructured.length,
          totalJdCount: jobDescriptions.length + jdFileAssets.length,
          notifyWebhookUrl: dto.notifyWebhookUrl,
          notifyEmail: dto.notifyEmail,
        },
      });

      const createdResumeFileItems = await Promise.all(
        resumeFileAssets.map((fa) =>
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

      const createdResumeTextItems = await Promise.all(
        resumeTexts.map((input) =>
          tx.scoringBatchResume.create({
            data: {
              batchId: createdBatch.id,
              rawText: input.rawText,
              candidateLabel: input.label,
              status: 'PENDING',
            },
          }),
        ),
      );

      const createdResumeStructuredItems = await Promise.all(
        resumeStructured.map((input) => {
          const parsedData = this.mapStructuredResumeToParsedData(input);

          return tx.scoringBatchResume.create({
            data: {
              batchId: createdBatch.id,
              candidateLabel: input.label ?? parsedData.personal.full_name ?? undefined,
              status: 'SUCCESS',
              parsedData: parsedData as object,
            },
          });
        }),
      );

      const createdJdTextItems = await Promise.all(
        jobDescriptions.map((jd) =>
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

      const createdJdFileItems = await Promise.all(
        jdFileAssets.map((fa, index) =>
          tx.scoringBatchJobDescription.create({
            data: {
              batchId: createdBatch.id,
              fileAssetId: fa.id,
              label: jobDescriptionFiles[index].label ?? fa.fileName,
              status: 'PENDING',
            },
          }),
        ),
      );

      await tx.scoringBatch.update({
        where: { id: createdBatch.id },
        data: { status: 'PARSING', startedAt: new Date() },
      });

      return {
        batch: createdBatch,
        resumeItems: {
          file: createdResumeFileItems,
          text: createdResumeTextItems,
          structured: createdResumeStructuredItems,
        },
        jdItems: { text: createdJdTextItems, file: createdJdFileItems },
      };
    });

    await Promise.all([
      ...resumeItems.file.map((item, index) => {
        const fa = resumeFileAssets[index];

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
      ...resumeItems.text.map((item) =>
        this.resumeParseQueue.add(
          'resume-parse',
          {
            batchId: batch.id,
            tier: 'ENTERPRISE',
            resumeItemId: item.id,
            rawText: item.rawText!,
            organizationId,
          },
          JOB_RETRY_OPTIONS,
        ),
      ),
      ...jdItems.text.map((item) =>
        this.jdParseQueue.add(
          'jd-parse',
          { batchId: batch.id, tier: 'ENTERPRISE', jdItemId: item.id, rawText: item.rawText! },
          JOB_RETRY_OPTIONS,
        ),
      ),
      ...jdItems.file.map((item, index) => {
        const fa = jdFileAssets[index];

        return this.jdParseQueue.add(
          'jd-parse',
          {
            batchId: batch.id,
            tier: 'ENTERPRISE',
            jdItemId: item.id,
            storageKey: fa.storageKey,
            bucket: fa.bucket,
            fileName: fa.fileName,
            fileType: fa.fileType,
          },
          JOB_RETRY_OPTIONS,
        );
      }),
    ]);

    return {
      batchId: batch.id,
      status: 'PARSING' as const,
      totalCvCount: resumeItems.file.length + resumeItems.text.length + resumeItems.structured.length,
      totalJdCount: jdItems.text.length + jdItems.file.length,
    };
  }

  private mapStructuredResumeToParsedData(input: ResumeStructuredInputDto): ParsedResumeData {
    return {
      personal: {
        full_name: input.personal?.fullName ?? null,
        email: input.personal?.email ?? null,
        phone: input.personal?.phone ?? null,
        location: input.personal?.location ?? null,
        linkedin_url: input.personal?.linkedinUrl ?? null,
        github_url: input.personal?.githubUrl ?? null,
        portfolio_url: input.personal?.portfolioUrl ?? null,
      },
      summary: input.summary ?? null,
      skills: (input.skills ?? []).map((skill) => ({
        name: skill.name,
        normalized_name: skill.name.trim().toLowerCase(),
        category: skill.category ?? null,
        evidence: skill.evidence ?? null,
        level: skill.level ?? null,
      })),
      education: (input.education ?? []).map((education) => ({
        institution: education.institution ?? null,
        degree: education.degree ?? null,
        field_of_study: education.fieldOfStudy ?? null,
        start_year: education.startYear ?? null,
        end_year: education.endYear ?? null,
        gpa: education.gpa ?? null,
        gpa_scale: education.gpaScale ?? null,
        description: education.description ?? null,
      })),
      experience: (input.experience ?? []).map((experience) => ({
        company: experience.company ?? null,
        role: experience.role ?? null,
        location: experience.location ?? null,
        start_date: experience.startDate ?? null,
        end_date: experience.endDate ?? null,
        duration_months: experience.durationMonths ?? null,
        responsibilities: experience.responsibilities ?? [],
        technologies: experience.technologies ?? [],
      })),
      projects: (input.projects ?? []).map((project) => ({
        name: project.name ?? null,
        role: project.role ?? null,
        start_date: project.startDate ?? null,
        end_date: project.endDate ?? null,
        description: project.description ?? null,
        technologies: project.technologies ?? [],
        urls: project.urls ?? [],
      })),
      certifications: (input.certifications ?? []).map((certification) => ({
        name: certification.name ?? null,
        issuer: certification.issuer ?? null,
        issued_year: certification.issuedYear ?? null,
        url: certification.url ?? null,
      })),
      achievements: (input.achievements ?? []).map((achievement) => ({
        title: achievement.title ?? null,
        description: achievement.description ?? null,
        year: achievement.year ?? null,
      })),
      languages: (input.languages ?? []).map((language) => ({
        name: language.name,
        proficiency: language.proficiency ?? null,
      })),
    };
  }
}
