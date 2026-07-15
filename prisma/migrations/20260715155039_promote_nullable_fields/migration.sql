-- AlterTable
ALTER TABLE "JobDescription" ALTER COLUMN "rawText" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Resume" ALTER COLUMN "fileAssetId" DROP NOT NULL;
