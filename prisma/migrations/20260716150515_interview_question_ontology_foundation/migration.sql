-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "OccupationFamily" AS ENUM ('IT', 'MARKETING', 'DESIGN', 'DATA', 'PRODUCT', 'SALES', 'LEGAL');

-- CreateEnum
CREATE TYPE "CompetencyType" AS ENUM ('HARD_SKILL', 'TOOL_SKILL', 'KNOWLEDGE_AREA', 'SOFT_SKILL', 'METHODOLOGY', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "AssessmentTarget" AS ENUM ('RECALL', 'APPLICATION', 'ANALYSIS', 'DECISION_MAKING', 'COMMUNICATION', 'LEADERSHIP', 'OWNERSHIP');

-- CreateEnum
CREATE TYPE "ExperienceBucket" AS ENUM ('ZERO_TO_ONE', 'TWO_TO_FOUR', 'FIVE_TO_EIGHT', 'EIGHT_PLUS');

-- CreateEnum
CREATE TYPE "AutonomyLevel" AS ENUM ('WORKS_INDEPENDENTLY', 'LEADS_PROJECTS', 'DEFINES_STRATEGY', 'MANAGES_PEOPLE');

-- CreateEnum
CREATE TYPE "InterviewQuestionType" AS ENUM ('EXPERIENCE_VALIDATION', 'ARTIFACT_DISCUSSION', 'DECISION_MAKING', 'BEHAVIORAL_EVIDENCE', 'REFLECTION');

-- CreateEnum
CREATE TYPE "InterviewQuestionSource" AS ENUM ('SEED', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "QuestionQualityGateStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "InterviewQuestionEntry" (
    "id" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "occupationFamily" "OccupationFamily" NOT NULL,
    "specialization" TEXT NOT NULL,
    "enablers" TEXT[],
    "businessContext" TEXT NOT NULL,
    "competency" TEXT NOT NULL,
    "competencyType" "CompetencyType" NOT NULL,
    "assessmentTarget" "AssessmentTarget" NOT NULL,
    "experienceBucket" "ExperienceBucket" NOT NULL,
    "autonomyLevel" "AutonomyLevel" NOT NULL,
    "questionType" "InterviewQuestionType" NOT NULL,
    "rubric" TEXT[],
    "embedding" vector(768),
    "source" "InterviewQuestionSource" NOT NULL DEFAULT 'SEED',
    "qualityGateStatus" "QuestionQualityGateStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "originBatchId" TEXT,
    "originResumeItemId" TEXT,
    "originJdItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewQuestionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewQuestionEntry_occupationFamily_specialization_idx" ON "InterviewQuestionEntry"("occupationFamily", "specialization");

-- CreateIndex
CREATE INDEX "InterviewQuestionEntry_questionType_idx" ON "InterviewQuestionEntry"("questionType");

-- CreateIndex
CREATE INDEX "InterviewQuestionEntry_qualityGateStatus_idx" ON "InterviewQuestionEntry"("qualityGateStatus");
