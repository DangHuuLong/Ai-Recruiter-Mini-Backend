
-- DropForeignKey
ALTER TABLE "ScoringBatchResume" DROP CONSTRAINT "ScoringBatchResume_fileAssetId_fkey";

-- AlterTable
ALTER TABLE "ScoringBatchJobDescription" ADD COLUMN     "fileAssetId" TEXT,
ALTER COLUMN "rawText" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ScoringBatchResume" ALTER COLUMN "fileAssetId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ScoringBatchResume" ADD CONSTRAINT "ScoringBatchResume_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringBatchJobDescription" ADD CONSTRAINT "ScoringBatchJobDescription_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

