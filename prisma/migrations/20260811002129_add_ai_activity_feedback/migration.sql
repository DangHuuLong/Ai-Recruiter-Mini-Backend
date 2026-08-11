-- CreateEnum
CREATE TYPE "FeedbackAccuracy" AS ENUM ('ACCURATE', 'OK', 'INACCURATE');

-- CreateEnum
CREATE TYPE "FeedbackSpeed" AS ENUM ('FAST', 'NORMAL', 'SLOW');

-- CreateTable
CREATE TABLE "AiActivityFeedback" (
    "id" TEXT NOT NULL,
    "tier" "AiCallTier" NOT NULL,
    "accuracy" "FeedbackAccuracy" NOT NULL,
    "reasons" TEXT[],
    "speed" "FeedbackSpeed" NOT NULL,
    "comment" TEXT,
    "organizationId" TEXT,
    "batchId" TEXT,
    "evaluationId" TEXT,
    "resumeId" TEXT,
    "jobDescriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiActivityFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiActivityFeedback_tier_idx" ON "AiActivityFeedback"("tier");

-- CreateIndex
CREATE INDEX "AiActivityFeedback_accuracy_idx" ON "AiActivityFeedback"("accuracy");

-- CreateIndex
CREATE INDEX "AiActivityFeedback_organizationId_idx" ON "AiActivityFeedback"("organizationId");

-- CreateIndex
CREATE INDEX "AiActivityFeedback_batchId_idx" ON "AiActivityFeedback"("batchId");

-- CreateIndex
CREATE INDEX "AiActivityFeedback_evaluationId_idx" ON "AiActivityFeedback"("evaluationId");

-- CreateIndex
CREATE INDEX "AiActivityFeedback_createdAt_idx" ON "AiActivityFeedback"("createdAt");

-- AddForeignKey
ALTER TABLE "AiActivityFeedback" ADD CONSTRAINT "AiActivityFeedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
