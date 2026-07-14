-- CreateEnum
CREATE TYPE "ScoringBatchStatus" AS ENUM ('PENDING', 'PARSING', 'SCORING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ScoringBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT,
    "status" "ScoringBatchStatus" NOT NULL DEFAULT 'PENDING',
    "evaluationConfigId" TEXT,
    "totalCvCount" INTEGER NOT NULL DEFAULT 0,
    "totalJdCount" INTEGER NOT NULL DEFAULT 0,
    "totalPairCount" INTEGER NOT NULL DEFAULT 0,
    "completedPairCount" INTEGER NOT NULL DEFAULT 0,
    "failedPairCount" INTEGER NOT NULL DEFAULT 0,
    "notifyWebhookUrl" TEXT,
    "notifyEmail" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringBatchResume" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "checksum" TEXT,
    "candidateLabel" TEXT,
    "status" "ParseStatus" NOT NULL DEFAULT 'PENDING',
    "rawText" TEXT,
    "parsedData" JSONB,
    "parsingError" TEXT,
    "candidateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringBatchResume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringBatchJobDescription" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "label" TEXT,
    "rawText" TEXT NOT NULL,
    "status" "ParseStatus" NOT NULL DEFAULT 'PENDING',
    "parsedData" JSONB,
    "parsingError" TEXT,
    "jobDescriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringBatchJobDescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringBatchResult" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "resumeItemId" TEXT NOT NULL,
    "jdItemId" TEXT NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "overallScore" DOUBLE PRECISION,
    "summary" TEXT,
    "criteria" JSONB,
    "skills" JSONB,
    "explanation" TEXT,
    "skillGapSummary" TEXT,
    "interviewQuestions" JSONB,
    "evidenceMap" JSONB,
    "error" TEXT,
    "scoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringBatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoringBatch_organizationId_idx" ON "ScoringBatch"("organizationId");

-- CreateIndex
CREATE INDEX "ScoringBatch_status_idx" ON "ScoringBatch"("status");

-- CreateIndex
CREATE INDEX "ScoringBatchResume_batchId_idx" ON "ScoringBatchResume"("batchId");

-- CreateIndex
CREATE INDEX "ScoringBatchResume_status_idx" ON "ScoringBatchResume"("status");

-- CreateIndex
CREATE INDEX "ScoringBatchResume_checksum_idx" ON "ScoringBatchResume"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringBatchResume_batchId_fileAssetId_key" ON "ScoringBatchResume"("batchId", "fileAssetId");

-- CreateIndex
CREATE INDEX "ScoringBatchJobDescription_batchId_idx" ON "ScoringBatchJobDescription"("batchId");

-- CreateIndex
CREATE INDEX "ScoringBatchJobDescription_status_idx" ON "ScoringBatchJobDescription"("status");

-- CreateIndex
CREATE INDEX "ScoringBatchResult_batchId_idx" ON "ScoringBatchResult"("batchId");

-- CreateIndex
CREATE INDEX "ScoringBatchResult_overallScore_idx" ON "ScoringBatchResult"("overallScore");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringBatchResult_resumeItemId_jdItemId_key" ON "ScoringBatchResult"("resumeItemId", "jdItemId");

-- AddForeignKey
ALTER TABLE "ScoringBatch" ADD CONSTRAINT "ScoringBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringBatch" ADD CONSTRAINT "ScoringBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringBatch" ADD CONSTRAINT "ScoringBatch_evaluationConfigId_fkey" FOREIGN KEY ("evaluationConfigId") REFERENCES "EvaluationConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringBatchResume" ADD CONSTRAINT "ScoringBatchResume_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ScoringBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringBatchResume" ADD CONSTRAINT "ScoringBatchResume_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringBatchResume" ADD CONSTRAINT "ScoringBatchResume_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringBatchJobDescription" ADD CONSTRAINT "ScoringBatchJobDescription_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ScoringBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringBatchJobDescription" ADD CONSTRAINT "ScoringBatchJobDescription_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "JobDescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringBatchResult" ADD CONSTRAINT "ScoringBatchResult_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ScoringBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringBatchResult" ADD CONSTRAINT "ScoringBatchResult_resumeItemId_fkey" FOREIGN KEY ("resumeItemId") REFERENCES "ScoringBatchResume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringBatchResult" ADD CONSTRAINT "ScoringBatchResult_jdItemId_fkey" FOREIGN KEY ("jdItemId") REFERENCES "ScoringBatchJobDescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

