// Creates and manages enterprise scoring batches: upload URLs, file/text/structured intake, queueing parse jobs, and matrix/CSV/cell reads.
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScoringBatch } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';

import { CreateScoringBatchDto } from './dto/create-scoring-batch.dto';
import { CreateUploadUrlsDto } from './dto/create-upload-urls.dto';
import { MatrixQueryDto } from './dto/matrix-query.dto';
import { ScoringBatchQueryDto } from './dto/scoring-batch-query.dto';
import { SkillGapQueryDto } from './dto/skill-gap-query.dto';
import { mapStructuredJdToParsedData } from './job-description-structured.mapper';
import { mapStructuredResumeToParsedData } from './resume-structured.mapper';
import { AppException } from '../../common/exceptions/app.exception';
import { DEFAULT_MAX_FILE_SIZE_MB } from '../../common/constants/upload.constants';
import { computeSha256Hex } from '../../common/utils/checksum.util';
import {
  getUploadFileExtension,
  isAllowedUploadMimeType,
  isFileSizeAllowed,
  resolveResumeFileType,
} from '../../common/utils/upload-file.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import { SupabaseStorageService } from '../../integrations/storage/supabase-storage.service';
import { BatchProgressCoordinatorService } from '../../queue/batch-progress-coordinator.service';
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
    private readonly coordinator: BatchProgressCoordinatorService,
    @InjectQueue(QUEUE_NAMES.RESUME_PARSE) private readonly resumeParseQueue: Queue<ResumeParseJobData>,
    @InjectQueue(QUEUE_NAMES.JD_PARSE) private readonly jdParseQueue: Queue<JdParseJobData>,
  ) {}

  // Called by ScoringBatchesController.createUploadUrls — issues pre-signed upload URLs for files the client wants to include in a batch.
  async createUploadUrls(dto: CreateUploadUrlsDto, organizationId: string) {
    const maxFileSizeMb =
      this.configService.get<number>('MAX_FILE_SIZE_MB') ?? DEFAULT_MAX_FILE_SIZE_MB;

    const isResume = dto.kind === 'RESUME';
    const maxAllowed = isResume
      ? (this.configService.get<number>('ENTERPRISE_MAX_FILES_PER_BATCH') ?? 2000)
      : (this.configService.get<number>('ENTERPRISE_MAX_JDS_PER_BATCH') ?? 50);

    if (dto.files.length > maxAllowed) {
      throw new AppException(
        `Batch exceeds the maximum of ${maxAllowed} ${isResume ? 'resumes' : 'job descriptions'} per batch`,
        400,
      );
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

  // Called from create()'s file-asset creation step — re-hashes the uploaded bytes to confirm they match the client-declared checksum.
  private async verifyChecksum(fileKey: string, bucket: string, declaredChecksum: string) {
    const buffer = await this.storageService.downloadFile(fileKey, bucket);
    const actualChecksum = computeSha256Hex(buffer);

    if (actualChecksum.toLowerCase() !== declaredChecksum.toLowerCase()) {
      throw new AppException(`Checksum mismatch for uploaded file: ${fileKey}`, 400);
    }
  }

  // Called by ScoringBatchesController.create — persists the batch and its resume/JD items, then enqueues resume-parse/jd-parse jobs on BullMQ.
  async create(dto: CreateScoringBatchDto, organizationId: string, userId: string) {
    const resumeFiles = dto.resumeFiles ?? [];
    const resumeTexts = dto.resumeTexts ?? [];
    const resumeStructured = dto.resumeStructured ?? [];
    const jobDescriptions = dto.jobDescriptions ?? [];
    const jobDescriptionFiles = dto.jobDescriptionFiles ?? [];
    const jobDescriptionStructured = dto.jobDescriptionStructured ?? [];

    if (resumeFiles.length + resumeTexts.length + resumeStructured.length === 0) {
      throw new AppException('At least one resume (file, text, or structured) is required', 400);
    }

    const totalJdCount =
      jobDescriptions.length + jobDescriptionFiles.length + jobDescriptionStructured.length;

    if (totalJdCount === 0) {
      throw new AppException('At least one job description (file, text, or structured) is required', 400);
    }

    const maxJds = this.configService.get<number>('ENTERPRISE_MAX_JDS_PER_BATCH') ?? 50;

    if (totalJdCount > maxJds) {
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

      if (ref.checksum) {
        await this.verifyChecksum(ref.fileKey, bucket, ref.checksum);
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
          totalJdCount,
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
          const parsedData = mapStructuredResumeToParsedData(input);

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

      const createdJdStructuredItems = await Promise.all(
        jobDescriptionStructured.map((input) => {
          const parsedData = mapStructuredJdToParsedData(input);

          return tx.scoringBatchJobDescription.create({
            data: {
              batchId: createdBatch.id,
              label: input.label ?? parsedData.title ?? undefined,
              status: 'SUCCESS',
              parsedData: parsedData as object,
            },
          });
        }),
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
        jdItems: {
          text: createdJdTextItems,
          file: createdJdFileItems,
          structured: createdJdStructuredItems,
        },
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

    await this.coordinator.checkParseCompletion(batch.id, 'ENTERPRISE');

    return {
      batchId: batch.id,
      status: 'PARSING' as const,
      totalCvCount: resumeItems.file.length + resumeItems.text.length + resumeItems.structured.length,
      totalJdCount: jdItems.text.length + jdItems.file.length + jdItems.structured.length,
    };
  }

  // Called by ScoringBatchesController.findAll — paginated, org-scoped list of scoring batches for the batch list UI.
  async findAll(query: ScoringBatchQueryDto, organizationId: string) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [batches, total] = await this.prisma.$transaction([
      this.prisma.scoringBatch.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [query.sortBy]: query.sortOrder },
        select: {
          id: true,
          name: true,
          status: true,
          totalCvCount: true,
          totalJdCount: true,
          totalPairCount: true,
          completedPairCount: true,
          failedPairCount: true,
          createdAt: true,
        },
      }),
      this.prisma.scoringBatch.count({ where }),
    ]);

    return {
      data: batches,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // Called by ScoringBatchesController.getStatus — returns the batch's current status and progress for client polling.
  async getStatus(batchId: string, organizationId: string) {
    const batch = await this.ensureBatchExists(batchId, organizationId);

    return {
      batchId: batch.id,
      name: batch.name,
      status: batch.status,
      progress: this.buildProgress(batch),
      startedAt: batch.startedAt,
      completedAt: batch.completedAt,
      createdAt: batch.createdAt,
    };
  }

  // Called by ScoringBatchesController.getMatrix — builds the paginated resume x JD score grid, optionally with top-N rankings.
  async getMatrix(batchId: string, organizationId: string, query: MatrixQueryDto) {
    const batch = await this.ensureBatchExists(batchId, organizationId);

    const rows = await this.prisma.scoringBatchResume.findMany({
      where: { batchId },
      orderBy: { id: 'asc' },
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit,
      select: {
        id: true,
        candidateLabel: true,
        status: true,
        parsingError: true,
        fileAsset: { select: { fileName: true } },
      },
    });

    const columns = await this.prisma.scoringBatchJobDescription.findMany({
      where: { batchId },
      orderBy: { id: 'asc' },
      select: { id: true, label: true, status: true, parsingError: true },
    });

    const rowIds = rows.map((row) => row.id);
    const cells = await this.prisma.scoringBatchResult.findMany({
      where: { batchId, resumeItemId: { in: rowIds } },
      select: { resumeItemId: true, jdItemId: true, status: true, overallScore: true, error: true },
    });

    const cellsByResumeId = new Map<string, typeof cells>();
    for (const cell of cells) {
      const bucket = cellsByResumeId.get(cell.resumeItemId) ?? [];
      bucket.push(cell);
      cellsByResumeId.set(cell.resumeItemId, bucket);
    }

    const topN = query.topN;

    const rowsWithRanking = rows.map((row) => ({
      resumeItemId: row.id,
      fileName: row.fileAsset?.fileName ?? null,
      candidateName: row.candidateLabel,
      parseStatus: row.status,
      parseError: row.parsingError,
      ...(topN ? { topJds: this.topJdsByScore(cellsByResumeId.get(row.id) ?? [], topN) } : {}),
    }));

    let columnsWithRanking = columns.map((column) => ({
      jdItemId: column.id,
      label: column.label,
      parseStatus: column.status,
      parseError: column.parsingError,
    }));

    if (topN) {
      const topCvsPerColumn = await Promise.all(
        columns.map((column) =>
          this.prisma.scoringBatchResult.findMany({
            where: { batchId, jdItemId: column.id, status: 'COMPLETED' },
            orderBy: { overallScore: 'desc' },
            take: topN,
            select: { resumeItemId: true, overallScore: true },
          }),
        ),
      );

      columnsWithRanking = columns.map((column, index) => ({
        jdItemId: column.id,
        label: column.label,
        parseStatus: column.status,
        parseError: column.parsingError,
        topCvs: topCvsPerColumn[index].map((cell) => ({
          resumeItemId: cell.resumeItemId,
          score: cell.overallScore,
        })),
      }));
    }

    return {
      batchId: batch.id,
      status: batch.status,
      progress: this.buildProgress(batch),
      rows: rowsWithRanking,
      columns: columnsWithRanking,
      cells: cells.map((cell) => ({
        resumeItemId: cell.resumeItemId,
        jdItemId: cell.jdItemId,
        status: cell.status,
        overallScore: cell.overallScore,
        error: cell.error,
      })),
      nextCursor: rows.length === query.limit ? rows[rows.length - 1].id : null,
    };
  }

  // Called by ScoringBatchesController.getCell — fetches the full score detail for one resume x JD pair, scoped to the batch/org.
  async getCell(batchId: string, resumeItemId: string, jdItemId: string, organizationId: string) {
    await this.ensureBatchExists(batchId, organizationId);

    const cell = await this.prisma.scoringBatchResult.findUnique({
      where: { resumeItemId_jdItemId: { resumeItemId, jdItemId } },
    });

    if (!cell || cell.batchId !== batchId) {
      throw new AppException('Cell not found', 404);
    }

    return cell;
  }

  // Called by ScoringBatchesController.getSkillGapSummary — tallies MISSING skills across completed results to surface the most common gaps.
  async getSkillGapSummary(batchId: string, organizationId: string, query: SkillGapQueryDto) {
    await this.ensureBatchExists(batchId, organizationId);

    const results = await this.prisma.scoringBatchResult.findMany({
      where: {
        batchId,
        status: 'COMPLETED',
        ...(query.jdItemId ? { jdItemId: query.jdItemId } : {}),
      },
      select: { skills: true },
    });

    const missingCounts = new Map<string, number>();

    for (const result of results) {
      const skills = result.skills as unknown as Array<{ skillName: string; type: string }> | null;

      for (const skill of skills ?? []) {
        if (skill.type !== 'MISSING') continue;
        missingCounts.set(skill.skillName, (missingCounts.get(skill.skillName) ?? 0) + 1);
      }
    }

    const missingSkills = [...missingCounts.entries()]
      .map(([skillName, missingCount]) => ({ skillName, missingCount }))
      .sort((a, b) => b.missingCount - a.missingCount);

    return { batchId, totalResultsConsidered: results.length, missingSkills };
  }

  // Called by ScoringBatchesController.exportCsv — builds a CSV of candidates x job descriptions with overall scores for download.
  async exportCsv(batchId: string, organizationId: string): Promise<string> {
    await this.ensureBatchExists(batchId, organizationId);

    const [resumeItems, jdItems, results] = await Promise.all([
      this.prisma.scoringBatchResume.findMany({
        where: { batchId },
        orderBy: { id: 'asc' },
        select: { id: true, candidateLabel: true, fileAsset: { select: { fileName: true } } },
      }),
      this.prisma.scoringBatchJobDescription.findMany({
        where: { batchId },
        orderBy: { id: 'asc' },
        select: { id: true, label: true },
      }),
      this.prisma.scoringBatchResult.findMany({
        where: { batchId },
        select: { resumeItemId: true, jdItemId: true, overallScore: true },
      }),
    ]);

    const scoreByPairKey = new Map<string, number | null>();
    for (const result of results) {
      scoreByPairKey.set(`${result.resumeItemId}:${result.jdItemId}`, result.overallScore);
    }

    const header = ['Candidate', ...jdItems.map((jd) => jd.label ?? jd.id)];
    const lines = [header.map(csvEscape).join(',')];

    for (const resume of resumeItems) {
      const name = resume.candidateLabel ?? resume.fileAsset?.fileName ?? resume.id;
      const row = [
        name,
        ...jdItems.map((jd) => {
          const score = scoreByPairKey.get(`${resume.id}:${jd.id}`);
          return score !== undefined && score !== null ? String(score) : '';
        }),
      ];
      lines.push(row.map(csvEscape).join(','));
    }

    return lines.join('\n');
  }

  // Called by ScoringBatchesController.cancel — marks a non-terminal batch as CANCELLED, stopping further processing.
  async cancel(batchId: string, organizationId: string) {
    const batch = await this.ensureBatchExists(batchId, organizationId);
    const terminalStatuses = new Set(['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED']);

    if (terminalStatuses.has(batch.status)) {
      throw new AppException(`Cannot cancel a batch in status ${batch.status}`, 409);
    }

    await this.prisma.scoringBatch.update({
      where: { id: batchId },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    return { batchId, status: 'CANCELLED' as const };
  }

  // Shared by nearly every method above — loads an org-scoped ScoringBatch or throws a 404.
  private async ensureBatchExists(batchId: string, organizationId: string): Promise<ScoringBatch> {
    const batch = await this.prisma.scoringBatch.findFirst({ where: { id: batchId, organizationId } });

    if (!batch) {
      throw new AppException('Scoring batch not found', 404);
    }

    return batch;
  }

  // Called by getStatus() and getMatrix() — derives the completed/failed/percent progress shape from raw batch counters.
  private buildProgress(batch: ScoringBatch) {
    return {
      totalCvCount: batch.totalCvCount,
      totalJdCount: batch.totalJdCount,
      totalPairCount: batch.totalPairCount,
      completedPairCount: batch.completedPairCount,
      failedPairCount: batch.failedPairCount,
      percent:
        batch.totalPairCount > 0
          ? Math.round((batch.completedPairCount / batch.totalPairCount) * 10000) / 100
          : 0,
    };
  }

  // Called by getMatrix() when topN is requested — ranks a resume's scored JD cells and returns the top N.
  private topJdsByScore(
    cells: Array<{ jdItemId: string; overallScore: number | null }>,
    topN: number,
  ): Array<{ jdItemId: string; score: number | null }> {
    return [...cells]
      .filter((cell) => cell.overallScore !== null)
      .sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))
      .slice(0, topN)
      .map((cell) => ({ jdItemId: cell.jdItemId, score: cell.overallScore }));
  }
}

// Called by exportCsv() — quotes/escapes a CSV field value per RFC 4180 rules.
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}
