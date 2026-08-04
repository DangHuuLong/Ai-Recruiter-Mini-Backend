-- CreateEnum
CREATE TYPE "AiFunctionType" AS ENUM ('PARSE_RESUME', 'PARSE_JOB_DESCRIPTION', 'SCORE_APPLICATION');

-- CreateEnum
CREATE TYPE "AiCallStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "AiCallTier" AS ENUM ('ENTERPRISE', 'PUBLIC');

-- CreateTable
CREATE TABLE "AiActivityLog" (
    "id" TEXT NOT NULL,
    "functionType" "AiFunctionType" NOT NULL,
    "tier" "AiCallTier" NOT NULL,
    "status" "AiCallStatus" NOT NULL,
    "organizationId" TEXT,
    "batchId" TEXT,
    "evaluationId" TEXT,
    "resumeId" TEXT,
    "jobDescriptionId" TEXT,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "errorMessage" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiActivityLog_functionType_idx" ON "AiActivityLog"("functionType");

-- CreateIndex
CREATE INDEX "AiActivityLog_tier_idx" ON "AiActivityLog"("tier");

-- CreateIndex
CREATE INDEX "AiActivityLog_status_idx" ON "AiActivityLog"("status");

-- CreateIndex
CREATE INDEX "AiActivityLog_organizationId_idx" ON "AiActivityLog"("organizationId");

-- CreateIndex
CREATE INDEX "AiActivityLog_createdAt_idx" ON "AiActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "AiActivityLog_batchId_idx" ON "AiActivityLog"("batchId");

-- CreateIndex
CREATE INDEX "AiActivityLog_resumeId_idx" ON "AiActivityLog"("resumeId");

-- CreateIndex
CREATE INDEX "AiActivityLog_jobDescriptionId_idx" ON "AiActivityLog"("jobDescriptionId");

-- AddForeignKey
ALTER TABLE "AiActivityLog" ADD CONSTRAINT "AiActivityLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
