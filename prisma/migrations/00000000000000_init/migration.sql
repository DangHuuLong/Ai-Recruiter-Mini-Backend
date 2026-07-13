-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'RECRUITER', 'HIRING_MANAGER');

-- CreateEnum
CREATE TYPE "FileAssetStatus" AS ENUM ('ACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "ResumeFileType" AS ENUM ('PDF', 'DOCX');

-- CreateEnum
CREATE TYPE "ParseStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'APPLIED', 'SCREENING', 'SHORTLISTED', 'INTERVIEWING', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CriterionName" AS ENUM ('SKILLS_MATCH', 'EXPERIENCE_RELEVANCE', 'PROJECT_RELEVANCE', 'EDUCATION_CERTIFICATION', 'KEYWORD_DOMAIN_ALIGNMENT');

-- CreateEnum
CREATE TYPE "SkillMatchType" AS ENUM ('MATCHED', 'MISSING', 'RELATED');

-- CreateEnum
CREATE TYPE "JobSkillType" AS ENUM ('REQUIRED', 'PREFERRED');

-- CreateEnum
CREATE TYPE "CandidateIdentityConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "billingEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'RECRUITER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalFileUrl" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileType" "ResumeFileType" NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "bucket" TEXT NOT NULL,
    "status" "FileAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fullName" TEXT,
    "primaryEmail" TEXT,
    "primaryPhone" TEXT,
    "linkedinUrl" TEXT,
    "portfolioUrl" TEXT,
    "githubUrl" TEXT,
    "location" TEXT,
    "latestHeadline" TEXT,
    "summary" TEXT,
    "identityConfidence" "CandidateIdentityConfidence" NOT NULL DEFAULT 'LOW',
    "normalizedProfile" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "rawText" TEXT,
    "parsedData" JSONB,
    "parseStatus" "ParseStatus" NOT NULL DEFAULT 'PENDING',
    "parserVersion" TEXT,
    "parsingError" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobDescription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "companyName" TEXT,
    "department" TEXT,
    "location" TEXT,
    "employmentType" TEXT,
    "seniority" TEXT,
    "rawText" TEXT NOT NULL,
    "parsedData" JSONB,
    "parserVersion" TEXT,
    "parseStatus" "ParseStatus" NOT NULL DEFAULT 'PENDING',
    "parsingError" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobDescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSkill" (
    "id" TEXT NOT NULL,
    "jobDescriptionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT,
    "type" "JobSkillType" NOT NULL,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "weightHint" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobDescriptionId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "createdById" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "source" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobDescriptionId" TEXT,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "criteriaDefinition" JSONB NOT NULL,
    "totalWeight" DOUBLE PRECISION NOT NULL,
    "version" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "configId" TEXT,
    "createdById" TEXT,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "overallScore" DOUBLE PRECISION,
    "summary" TEXT,
    "explanation" TEXT,
    "skillGapSummary" TEXT,
    "interviewQuestions" JSONB,
    "evidenceMap" JSONB,
    "modelProvider" TEXT,
    "modelName" TEXT,
    "modelVersion" TEXT,
    "promptVersion" TEXT,
    "evaluationError" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationCriterionScore" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "criterion" "CriterionName" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "scoreNormalized" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationCriterionScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationSkill" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,
    "normalizedSkillName" TEXT,
    "type" "SkillMatchType" NOT NULL,
    "importance" TEXT,
    "evidence" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationInterviewQuestion" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "category" TEXT,
    "linkedSkill" TEXT,
    "difficulty" TEXT,
    "rationale" TEXT,
    "displayOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationInterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_type_idx" ON "AuthToken"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_storageKey_key" ON "FileAsset"("storageKey");

-- CreateIndex
CREATE INDEX "FileAsset_organizationId_idx" ON "FileAsset"("organizationId");

-- CreateIndex
CREATE INDEX "FileAsset_fileType_idx" ON "FileAsset"("fileType");

-- CreateIndex
CREATE INDEX "FileAsset_checksum_idx" ON "FileAsset"("checksum");

-- CreateIndex
CREATE INDEX "FileAsset_status_idx" ON "FileAsset"("status");

-- CreateIndex
CREATE INDEX "FileAsset_uploadedAt_idx" ON "FileAsset"("uploadedAt");

-- CreateIndex
CREATE INDEX "Candidate_organizationId_idx" ON "Candidate"("organizationId");

-- CreateIndex
CREATE INDEX "Candidate_organizationId_primaryEmail_idx" ON "Candidate"("organizationId", "primaryEmail");

-- CreateIndex
CREATE INDEX "Candidate_organizationId_primaryPhone_idx" ON "Candidate"("organizationId", "primaryPhone");

-- CreateIndex
CREATE INDEX "Candidate_fullName_idx" ON "Candidate"("fullName");

-- CreateIndex
CREATE INDEX "Resume_candidateId_idx" ON "Resume"("candidateId");

-- CreateIndex
CREATE INDEX "Resume_fileAssetId_idx" ON "Resume"("fileAssetId");

-- CreateIndex
CREATE INDEX "Resume_parseStatus_idx" ON "Resume"("parseStatus");

-- CreateIndex
CREATE INDEX "JobDescription_organizationId_idx" ON "JobDescription"("organizationId");

-- CreateIndex
CREATE INDEX "JobDescription_createdById_idx" ON "JobDescription"("createdById");

-- CreateIndex
CREATE INDEX "JobDescription_title_idx" ON "JobDescription"("title");

-- CreateIndex
CREATE INDEX "JobDescription_companyName_idx" ON "JobDescription"("companyName");

-- CreateIndex
CREATE INDEX "JobDescription_parseStatus_idx" ON "JobDescription"("parseStatus");

-- CreateIndex
CREATE INDEX "JobSkill_jobDescriptionId_idx" ON "JobSkill"("jobDescriptionId");

-- CreateIndex
CREATE INDEX "JobSkill_name_idx" ON "JobSkill"("name");

-- CreateIndex
CREATE INDEX "JobSkill_normalizedName_idx" ON "JobSkill"("normalizedName");

-- CreateIndex
CREATE INDEX "Application_organizationId_idx" ON "Application"("organizationId");

-- CreateIndex
CREATE INDEX "Application_candidateId_idx" ON "Application"("candidateId");

-- CreateIndex
CREATE INDEX "Application_jobDescriptionId_idx" ON "Application"("jobDescriptionId");

-- CreateIndex
CREATE INDEX "Application_resumeId_idx" ON "Application"("resumeId");

-- CreateIndex
CREATE INDEX "Application_createdById_idx" ON "Application"("createdById");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "ApplicationEvent_applicationId_idx" ON "ApplicationEvent"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationEvent_eventType_idx" ON "ApplicationEvent"("eventType");

-- CreateIndex
CREATE INDEX "EvaluationConfig_organizationId_idx" ON "EvaluationConfig"("organizationId");

-- CreateIndex
CREATE INDEX "EvaluationConfig_jobDescriptionId_idx" ON "EvaluationConfig"("jobDescriptionId");

-- CreateIndex
CREATE INDEX "EvaluationConfig_createdById_idx" ON "EvaluationConfig"("createdById");

-- CreateIndex
CREATE INDEX "EvaluationConfig_isDefault_idx" ON "EvaluationConfig"("isDefault");

-- CreateIndex
CREATE INDEX "Evaluation_organizationId_idx" ON "Evaluation"("organizationId");

-- CreateIndex
CREATE INDEX "Evaluation_applicationId_idx" ON "Evaluation"("applicationId");

-- CreateIndex
CREATE INDEX "Evaluation_configId_idx" ON "Evaluation"("configId");

-- CreateIndex
CREATE INDEX "Evaluation_createdById_idx" ON "Evaluation"("createdById");

-- CreateIndex
CREATE INDEX "Evaluation_status_idx" ON "Evaluation"("status");

-- CreateIndex
CREATE INDEX "EvaluationCriterionScore_evaluationId_idx" ON "EvaluationCriterionScore"("evaluationId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationCriterionScore_evaluationId_criterion_key" ON "EvaluationCriterionScore"("evaluationId", "criterion");

-- CreateIndex
CREATE INDEX "EvaluationSkill_evaluationId_idx" ON "EvaluationSkill"("evaluationId");

-- CreateIndex
CREATE INDEX "EvaluationSkill_skillName_idx" ON "EvaluationSkill"("skillName");

-- CreateIndex
CREATE INDEX "EvaluationSkill_normalizedSkillName_idx" ON "EvaluationSkill"("normalizedSkillName");

-- CreateIndex
CREATE INDEX "EvaluationInterviewQuestion_evaluationId_idx" ON "EvaluationInterviewQuestion"("evaluationId");

-- CreateIndex
CREATE INDEX "EvaluationInterviewQuestion_linkedSkill_idx" ON "EvaluationInterviewQuestion"("linkedSkill");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDescription" ADD CONSTRAINT "JobDescription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDescription" ADD CONSTRAINT "JobDescription_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "JobDescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "JobDescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationConfig" ADD CONSTRAINT "EvaluationConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationConfig" ADD CONSTRAINT "EvaluationConfig_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "JobDescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationConfig" ADD CONSTRAINT "EvaluationConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_configId_fkey" FOREIGN KEY ("configId") REFERENCES "EvaluationConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCriterionScore" ADD CONSTRAINT "EvaluationCriterionScore_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationSkill" ADD CONSTRAINT "EvaluationSkill_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationInterviewQuestion" ADD CONSTRAINT "EvaluationInterviewQuestion_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

