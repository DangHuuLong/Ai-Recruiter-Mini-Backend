/*
  Warnings:

  - You are about to drop the column `checksum` on the `Resume` table. All the data in the column will be lost.
  - You are about to drop the column `fileName` on the `Resume` table. All the data in the column will be lost.
  - You are about to drop the column `fileSizeBytes` on the `Resume` table. All the data in the column will be lost.
  - You are about to drop the column `fileType` on the `Resume` table. All the data in the column will be lost.
  - You are about to drop the column `originalFileUrl` on the `Resume` table. All the data in the column will be lost.
  - You are about to drop the column `storageKey` on the `Resume` table. All the data in the column will be lost.
  - Made the column `fileAssetId` on table `Resume` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Resume" DROP CONSTRAINT "Resume_fileAssetId_fkey";

-- DropIndex
DROP INDEX "Resume_checksum_idx";

-- AlterTable
ALTER TABLE "Resume" DROP COLUMN "checksum",
DROP COLUMN "fileName",
DROP COLUMN "fileSizeBytes",
DROP COLUMN "fileType",
DROP COLUMN "originalFileUrl",
DROP COLUMN "storageKey",
ALTER COLUMN "fileAssetId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
