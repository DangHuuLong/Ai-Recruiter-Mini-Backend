-- AlterTable
ALTER TABLE "ScoringBatchResume" ADD COLUMN     "resumeId" TEXT;

-- AddForeignKey
ALTER TABLE "ScoringBatchResume" ADD CONSTRAINT "ScoringBatchResume_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;
