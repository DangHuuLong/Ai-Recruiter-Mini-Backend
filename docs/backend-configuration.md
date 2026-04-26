# Backend Configuration

**Project:** AI Recruiter Mini — Backend Configuration  
**Framework:** NestJS · TypeScript · PostgreSQL · Prisma ORM · Supabase Storage  
**Scope:** Comprehensive backend setup, database models, API conventions, and domain architecture.

---

## 1. Purpose

The **AI Recruiter Mini Backend** is a NestJS application designed to power an internal recruiter dashboard for AI-assisted candidate screening.

### Key Responsibilities

- Receive and store uploaded CV files in Supabase Storage
- Persist structured data in PostgreSQL using Prisma ORM
- Parse CV and JD data into normalized, queryable JSON
- Match candidate skills against job requirements
- Calculate weighted evaluation scores
- Generate AI-powered explanations and interview questions
- Provide health checks for all critical services
- Enforce strict request validation and standardized responses

---

## 2. Project Structure

```
AI-RECRUITER-MINI-BACKEND
├── dist                    # Compiled JavaScript
├── docs                    # Documentation
├── node_modules            # Dependencies
├── prisma                  # Database schema
├── src                     # Source code
├── test                    # Test files
├── .env                    # Environment variables (local)
├── .env.example            # Environment template
├── package.json            # Project metadata
└── tsconfig.json           # TypeScript config
```

### Source Code Organization

```
src/
├── common/                 # Shared building blocks
│   ├── constants/          # Shared constants
│   ├── decorators/         # Custom decorators
│   ├── dto/                # Shared DTOs
│   ├── enums/              # Shared enums
│   ├── exceptions/         # Custom exceptions
│   ├── filters/            # Exception filters
│   ├── guards/             # Auth guards
│   ├── interceptors/       # Response/logging interceptors
│   ├── pipes/              # Validation pipes
│   ├── types/              # Shared TypeScript types
│   └── utils/              # Pure utility functions
│
├── config/                 # Environment configuration
│   ├── app.config.ts
│   ├── database.config.ts
│   ├── env.validation.ts
│   ├── redis.config.ts
│   └── supabase.config.ts
│
├── database/               # Database layer
│   └── prisma/
│       ├── prisma.module.ts
│       └── prisma.service.ts
│
├── integrations/           # External service integrations
│   ├── ai/                 # LLM provider (Gemini)
│   ├── parsing/            # CV/JD text extraction
│   ├── redis/              # Cache layer (optional)
│   └── storage/            # Supabase Storage
│
├── modules/                # Domain modules
│   ├── applications/       # Application tracking
│   ├── candidates/         # Candidate profiles
│   ├── evaluations/        # Scoring and generation
│   │   ├── generation/
│   │   ├── matching/
│   │   ├── parsing/
│   │   └── scoring/
│   ├── files/              # File upload
│   ├── health/             # Health checks
│   ├── job-descriptions/   # Job postings
│   └── resumes/            # CV management
│
├── app.module.ts           # Root module
└── main.ts                 # Application entry point
```

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Client Application                     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────┐
│              NestJS REST API (/api)                      │
│  • Global Validation Pipe                               │
│  • Global Response Interceptor                          │
│  • Global Exception Filter                              │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
   ┌─────────┐  ┌──────────┐  ┌─────────────┐
   │Candidates
   │          │
   ├─────────┤  ├──────────┤  ├─────────────┤
   │Resumes  │  │Files     │  │Job Desc     │
   ├─────────┤  ├──────────┤  ├─────────────┤
   │Apps     │  │Health    │  │Evaluations  │
   └────┬────┘  └────┬─────┘  └──────┬──────┘
        │            │               │
        └────────────┼───────────────┘
                     ↓
        ┌─────────────────────────────┐
        │    Integrations Layer       │
        ├─────────────────────────────┤
        │ • AI/LLM (Gemini)           │
        │ • Parsing (PDF/DOCX)        │
        │ • Storage (Supabase)        │
        │ • Cache (Redis - optional)  │
        └────────────┬────────────────┘
                     │
        ┌────────────┼────────────┐
        ↓            ↓            ↓
   ┌──────────┐ ┌────────┐ ┌────────────┐
   │PostgreSQL│ │Supabase│ │Redis       │
   │          │ │Storage │ │(optional)  │
   └──────────┘ └────────┘ └────────────┘
```

---

## 4. Application Bootstrap

### Entry Point

File: `src/main.ts`

This file sets up the global NestJS configuration when the application starts.

### 4.1 Global API Prefix

All routes are prefixed with `/api`:

```
GET /api/health
POST /api/candidates
GET /api/candidates/[id]
```

### 4.2 CORS Configuration

CORS is enabled globally to allow frontend requests:

```typescript
app.enableCors({
  origin: true,           // Allow all origins (development)
  credentials: true,      // Allow credentials
});
```

⚠️ **Production:** Restrict to trusted domains:

```typescript
app.enableCors({
  origin: ['https://yourdomain.com'],
  credentials: true,
});
```

### 4.3 Global Validation Pipe

All incoming requests are automatically validated:

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,              // Remove unknown fields
    transform: true,              // Convert to DTO instances
    forbidNonWhitelisted: true,   // Reject unknown fields
  }),
);
```

**Result:** Invalid or unknown fields are rejected before reaching controllers.

### 4.4 Global Response Interceptor

All successful responses are wrapped in a standard format.

File: `src/common/interceptors/transform-response.interceptor.ts`

**Example Success Response:**

```json
{
  "success": true,
  "message": "Candidate fetched successfully",
  "data": {
    "id": "cand_123",
    "fullName": "Nguyen Van A"
  }
}
```

**Example Paginated Response:**

```json
{
  "success": true,
  "message": "Candidates fetched successfully",
  "data": [
    { "id": "cand_123", "fullName": "Nguyen Van A" },
    { "id": "cand_124", "fullName": "Tran Van B" }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

### 4.5 Global Exception Filter

All errors are normalized to a consistent format.

File: `src/common/filters/http-exception.filter.ts`

**Example Error Response:**

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "title",
      "message": "title should not be empty"
    }
  ],
  "timestamp": "2026-04-25T10:30:00.000Z",
  "path": "/api/job-descriptions"
}
```

**Example Server Error:**

```json
{
  "success": false,
  "statusCode": 500,
  "message": "Internal server error",
  "errors": [],
  "timestamp": "2026-04-25T10:30:00.000Z",
  "path": "/api/example"
}
```

### 4.6 Swagger Documentation

API documentation is available during development:

```
URL: http://localhost:3000/docs
```

Swagger is **disabled in production** for security.

**Available API Tags:**
- `health`
- `candidates`
- `resumes`
- `job-descriptions`
- `applications`
- `evaluations`
- `files`

---

## 5. Application Module

File: `src/app.module.ts`

The root NestJS module imports:

- **ConfigModule** — Loads and validates environment variables
- **PrismaModule** — Database access (global)
- **StorageModule** — Supabase Storage (global)
- **RedisModule** — Optional caching (global)
- **HealthModule** — Service health checks

Domain modules (candidates, resumes, etc.) will be added here as they are implemented.

---

## 6. Environment Configuration

### Configuration Files

```
src/config/
├── app.config.ts          # App port and environment
├── database.config.ts     # Database connection
├── env.validation.ts      # Validation schema
├── redis.config.ts        # Redis URL (optional)
└── supabase.config.ts     # Supabase credentials
```

### How Configuration Works

1. Environment variables are loaded from `.env`
2. Joi schema in `env.validation.ts` validates them
3. Configuration files export typed config objects
4. Services inject `ConfigService` to access values

---

## 7. Environment Variables

### Required Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (backend only) |

### Optional Variables

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Application environment |
| `PORT` | `3000` | Server port |
| `SUPABASE_BUCKET` | `cv-files` | Storage bucket name |
| `REDIS_URL` | — | Redis connection (optional) |
| `GEMINI_API_KEY` | — | Gemini API key |
| `GEMINI_MODEL` | `gemini-3-flash-preview` | Gemini model |
| `MAX_FILE_SIZE_MB` | `5` | Max upload size in MB |

### Example .env File

```env
# Application
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/ai_recruiter_mini"
DIRECT_URL="postgresql://user:password@localhost:5432/ai_recruiter_mini"

# Storage
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SUPABASE_BUCKET="cv-files"

# Cache (Optional)
REDIS_URL="redis://localhost:6379"

# AI
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-3-flash-preview"

# Upload
MAX_FILE_SIZE_MB=5
```

---

## 8. Database Layer

### Prisma Setup

File: `src/database/prisma/prisma.service.ts`

The Prisma service:
- Connects to PostgreSQL on application startup
- Disconnects gracefully on shutdown
- Provides access to all database models

### Available Models

- `User` — Internal system users
- `FileAsset` — Uploaded file metadata and storage reference
- `Candidate` — Candidate profiles
- `Resume` — Candidate CV record and parsing state
- `JobDescription` — Job postings
- `JobSkill` — Skills extracted from JD
- `Application` — Candidate applications
- `ApplicationEvent` — Application audit trail
- `Evaluation` — Scoring results
- `EvaluationCriterionScore` — Score breakdown
- `EvaluationSkill` — Matched/missing skills
- `EvaluationInterviewQuestion` — Generated questions

---

## 9. Core Domain Models

### FileAsset

Represents an uploaded file stored in Supabase Storage.

`FileAsset` is the source of truth for uploaded file metadata.

**Key Fields:**
- `fileName` — Original uploaded file name
- `originalFileUrl` — Public or accessible file URL
- `storageKey` — Supabase storage object key
- `fileType` — Supported file type, such as PDF or DOCX
- `fileSizeBytes` — File size in bytes
- `checksum` — File checksum used for duplicate detection
- `bucket` — Supabase storage bucket
- `status` — File lifecycle status, such as ACTIVE or DELETED
- `uploadedAt` — Upload timestamp
- `deletedAt` — Soft delete timestamp

### Candidate

Represents a candidate profile.

**Key Fields:**
- `fullName` — Candidate name
- `primaryEmail` — Email address
- `primaryPhone` — Phone number
- `linkedinUrl`, `githubUrl`, `portfolioUrl` — Professional links
- `location` — Candidate location
- `normalizedProfile` — Aggregated data across all resumes
- `identityConfidence` — Confidence level for profile linking

### Resume

Represents a candidate CV record.

A resume belongs to a candidate and references one uploaded file through `fileAssetId`.

**Key Fields:**
- `candidateId` — Owner candidate
- `fileAssetId` — Uploaded file reference
- `rawText` — Extracted text from CV
- `parsedData` — Structured CV in JSON format
- `parseStatus` — Lifecycle status: PENDING, PROCESSING, SUCCESS, FAILED
- `parserVersion` — Parser version used for extraction
- `parsingError` — Error message if parsing failed

File metadata such as `fileName`, `storageKey`, `fileType`, `fileSizeBytes`, and `checksum` belongs to `FileAsset`, not `Resume`.

**Parsed CV Structure:**
```json
{
  "personal": { "name": "", "email": "" },
  "summary": "Professional summary",
  "skills": ["Skill 1", "Skill 2"],
  "education": [{ "school": "", "degree": "" }],
  "experience": [{ "company": "", "title": "", "duration": "" }],
  "projects": [{ "name": "", "description": "" }],
  "certifications": [],
  "languages": []
}
```

### Job Description

Represents a job posting.

**Key Fields:**
- `title` — Job title
- `companyName` — Company name
- `location` — Job location
- `rawText` — Original JD text
- `parsedData` — Structured JD in JSON format
- `parseStatus` — Lifecycle status
- `isActive` — Whether the JD is active

**Parsed JD Structure:**
```json
{
  "responsibilities": ["Responsibility 1", "Responsibility 2"],
  "requirements": ["Requirement 1", "Requirement 2"],
  "niceToHave": ["Nice to have 1"],
  "minExperienceYears": 3,
  "educationRequirement": "Bachelor's degree",
  "domainKeywords": ["AI", "ML"]
}
```

### Application

Links a candidate, resume, and job description together.

**Key Fields:**
- `candidateId`, `resumeId`, `jobDescriptionId` — References
- `status` — Application status
- `createdById` — User who created the application
- `appliedAt` — Application timestamp
- `notes` — Internal notes

**Important Rule:** The `resumeId` must belong to the selected `candidateId`.

### Evaluation

Stores the result of one scoring run.

**Key Fields:**
- `applicationId` — Related application
- `status` — Evaluation status (PENDING, PROCESSING, COMPLETED, FAILED)
- `overallScore` — Final score (0-100)
- `explanation` — Scoring explanation
- `skillGapSummary` — Summary of missing skills
- `interviewQuestions` — JSON snapshot of questions
- `startedAt`, `completedAt` — Timestamps

**Score Formula:**
```
overallScore = Σ(criterionScore × weight) × 100
```

---

## 10. Storage Integration

### Supabase Storage

File: `src/integrations/storage/supabase-storage.service.ts`

**Responsibilities:**
- Upload file buffers to Supabase
- Generate public URLs
- Delete files from storage
- Validate bucket existence

**Supported File Types:**
- PDF
- DOCX (Word documents)

**Upload Rules:**

| Rule | Value |
|---|---|
| Max file size | 5 MB (configurable) |
| Allowed bucket | `cv-files` |
| Storage folder | `resumes/` |
| Key format | `resumes/{uuid}.{extension}` |

**Storage Key Example:**
```
resumes/550e8400-e29b-41d4-a716-446655440000.pdf
```

### Upload Validation Flow

```
Receive file
  ↓
Validate MIME type
  ↓
Validate file size
  ↓
Generate unique storage key
  ↓
Upload to Supabase Storage
  ↓
Return public URL & storage key
```

### FileAsset Rules

- `FileAsset` is the source of truth for uploaded file metadata.
- `Resume` references uploaded files through `fileAssetId`.
- `Resume` should not duplicate file metadata such as file name, storage key, file type, file size, or checksum.
- `DELETE /api/files/:id` should perform a controlled delete through `FileAsset`.
- A file that is already linked to a `Resume` should not be physically deleted without checking domain rules.

---

## 11. Redis Integration (Optional)

File: `src/integrations/redis/redis.service.ts`

Redis is **optional** and disabled if `REDIS_URL` is not set.

**Good Use Cases:**
- Cache for expensive parsing operations
- Temporary evaluation progress tracking
- Short-lived job state

**Bad Use Cases:**
- Storing candidate data (use PostgreSQL)
- Storing evaluation results (use PostgreSQL)
- Permanent application state

---

## 12. Health Check Endpoint

### Endpoint

```
GET /api/health
```

### Response

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "service": "ai-recruiter-mini-backend",
    "status": "healthy",
    "database": "ok",
    "redis": "ok",
    "storage": "ok",
    "timestamp": "2026-04-25T10:30:00.000Z"
  }
}
```

### Checks Performed

| Service | Check |
|---|---|
| Database | Runs `SELECT 1` through Prisma |
| Redis | Runs `PING` (only if enabled) |
| Storage | Verifies Supabase bucket exists |

---

## 13. API Response Convention

### Standard Response Format

**Successful Response:**
```json
{
  "success": true,
  "message": "Resource fetched successfully",
  "data": { }
}
```

**Paginated Response:**
```json
{
  "success": true,
  "message": "Resources fetched successfully",
  "data": [ ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Invalid email format" }
  ],
  "timestamp": "2026-04-25T10:30:00.000Z",
  "path": "/api/candidates"
}
```

---

## 14. Validation Rules

All DTOs must explicitly define allowed fields using `class-validator`:

```typescript
export class CreateCandidateDto {
  @IsString()
  fullName!: string;

  @IsOptional()
  @IsEmail()
  primaryEmail?: string;
}
```

**Rules:**
- Unknown fields are **rejected**
- All field types are **transformed** automatically
- Validation errors are **detailed**

---

## 15. Pagination Convention

Paginated endpoints follow this pattern:

```typescript
// Query Parameters
page: number = 1
limit: number = 10
search?: string
sortBy?: string = 'createdAt'
sortOrder?: 'asc' | 'desc' = 'desc'
```

**Response:**
```json
{
  "success": true,
  "message": "Candidates fetched successfully",
  "data": [ ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

---

## 16. Exception Handling

### AppException Class

File: `src/common/exceptions/app.exception.ts`

Used for all application-level errors:

```typescript
throw new AppException('Candidate not found', 404);
throw new AppException('Invalid file type', 400);
throw new AppException('Resume has not been parsed', 409);
```

### HTTP Status Codes

| Scenario | Code |
|---|---|
| Invalid input | 400 |
| Unauthorized | 401 |
| Forbidden | 403 |
| Resource not found | 404 |
| Conflict or invalid state | 409 |
| Server error | 500 |
| External service failure | 502 |

---

## 17. Evaluation Scoring System

### Scoring Criteria

The evaluation uses weighted criteria:

| Criterion | Weight | Description |
|---|---|---|
| SKILLS_MATCH | 35% | Required and preferred skill alignment |
| EXPERIENCE_RELEVANCE | 30% | Work experience relevance to JD |
| PROJECT_RELEVANCE | 15% | Project relevance to the role |
| EDUCATION_CERTIFICATION | 10% | Education and certification fit |
| KEYWORD_DOMAIN_ALIGNMENT | 10% | Domain and keyword alignment |

**Total Weight:** 100%  
**Score Range:** 0.0 to 100.0

### Scoring Formula

```
for each criterion:
  criterionContribution = scoreNormalized × weight × 100
  
overallScore = Σ(criterionContribution)
```

Each criterion score is stored as 0.0 to 1.0, then normalized.

---

## 18. Parsing Status Lifecycle

Both resumes and job descriptions follow this status flow:

```
PENDING
  ↓
PROCESSING
  ↓
SUCCESS (success) or FAILED (failure)
```

If parsing fails, the error is stored in:
- `Resume.parsingError`
- `JobDescription.parsingError`

---

## 19. Module Structure

### Standard Module Folders

Each domain module should contain:

```
module-name/
├── api/                # API functions that call backend
├── components/         # UI components (if any)
├── dto/                # Data Transfer Objects
├── entities/           # Database entities
├── services/           # Business logic
└── module.ts           # Module definition
```

### Current Modules

| Module | Purpose |
|---|---|
| `candidates` | Candidate profile management |
| `resumes` | CV file and metadata management |
| `files` | File upload and validation |
| `job-descriptions` | Job posting management |
| `applications` | Application tracking |
| `evaluations` | Scoring and evaluation results |
| `health` | Service health checks |

---

## 20. Request Flow Examples

### Upload CV Flow
 
```
POST /api/files/upload
↓
Validate MIME type (PDF or DOCX)
↓
Validate file size
↓
Calculate checksum
↓
Generate unique storage key
↓
Upload to Supabase Storage
↓
Create FileAsset record
↓
Return FileAsset metadata
↓
POST /api/resumes
↓
Validate Candidate exists
↓
Validate FileAsset exists and ACTIVE
↓
Create Resume record with fileAssetId and parseStatus = PENDING
↓
Extract raw text
↓
Call AI service to parse resume
↓
Update Resume.rawText, Resume.parsedData, and Resume.parseStatus
```


### Evaluation Flow

```
POST /api/evaluations
  ↓
Validate Application exists
  ↓
Validate Resume belongs to Candidate
  ↓
Validate Resume.parseStatus = SUCCESS
  ↓
Validate JobDescription.parseStatus = SUCCESS
  ↓
Create Evaluation with status = PENDING
  ↓
Set status = PROCESSING
  ↓
Match skills (Resume skills vs JobSkill records)
  ↓
Create EvaluationSkill records
  ↓
Calculate criterion scores
  ↓
Create EvaluationCriterionScore records
  ↓
Calculate overallScore
  ↓
Generate explanation and interview questions
  ↓
Set status = COMPLETED
```

---

## 21. Source of Truth Rules

### File Data

| Data | Source |
|---|---|
| File metadata | `FileAsset` table |
| File URL | `FileAsset.originalFileUrl` |
| Storage location | `FileAsset.storageKey` |
| File type | `FileAsset.fileType` |
| File size | `FileAsset.fileSizeBytes` |
| File checksum | `FileAsset.checksum` |
| File lifecycle status | `FileAsset.status` |

### Resume Data

| Data | Source |
|---|---|
| Candidate ownership | `Resume.candidateId` |
| Uploaded file reference | `Resume.fileAssetId` |
| Extracted text | `Resume.rawText` |
| Structured CV | `Resume.parsedData` |
| Parsing lifecycle | `Resume.parseStatus` |
| Parsing error | `Resume.parsingError` |
| Candidate profile | `Candidate.normalizedProfile` |

### Job Description Data

| Data | Source |
|---|---|
| Original text | JobDescription.rawText |
| Parsed structure | JobDescription.parsedData |
| Skills list | **JobSkill table** ⭐ |

⭐ **Important:** Use `JobSkill` for skill matching, not `JobDescription.parsedData`.

### Evaluation Data

| Data | Source |
|---|---|
| Criterion scores | **EvaluationCriterionScore** ⭐ |
| Matched/missing skills | **EvaluationSkill** ⭐ |
| Interview questions | **EvaluationInterviewQuestion** ⭐ |
| Final score | Evaluation.overallScore (cached) |

---

## 22. Security Checklist

⚠️ **Before Production:**

- [ ] Restrict CORS origin to trusted domains
- [ ] Disable Swagger documentation
- [ ] Add authentication guards
- [ ] Add request rate limiting
- [ ] Validate all file uploads before storage
- [ ] Use signed or private URLs for CV files
- [ ] Set up logging and monitoring
- [ ] Never expose SUPABASE_SERVICE_ROLE_KEY
- [ ] Never commit `.env` to Git
- [ ] Add input sanitization for text fields

---

## 23. Configuration Summary

| Area | Setup |
|---|---|
| Framework | NestJS |
| Language | TypeScript |
| API Style | REST |
| Database | PostgreSQL + Prisma |
| Storage | Supabase Storage |
| Cache | Redis (optional) |
| AI Provider | Gemini |
| Validation | Global ValidationPipe |
| Response Format | Standardized DTO |
| Error Handling | Global exception filter |
| API Documentation | Swagger (dev only) |

---

## 24. Next Implementation Steps

1. **Add domain modules to AppModule** when each is ready
2. **Implement file asset upload flow** with validation, Supabase upload, checksum, and `FileAsset` persistence
3. **Implement candidates and resumes** creation flow
4. **Implement job description** parsing and JobSkill extraction
5. **Implement application** linking and tracking
6. **Seed default evaluation config** with criteria and weights
7. **Implement evaluation workflow** (matching → scoring → generation)
8. **Add comprehensive tests** for critical flows
9. **Set up background workers** for long-running parsing/evaluation
10. **Add observability** (logging, monitoring, tracing)

---

## 25. Architecture Principles

✅ **Do:**
- Keep business logic in domain modules
- Use AppException for predictable errors
- Store structured data in PostgreSQL
- Use JobSkill as source of truth for matching
- Keep integrations separate from domain logic
- Validate all inputs strictly

❌ **Don't:**
- Call APIs from common layer
- Use Redis for persistent data
- Expose service keys in responses
- Skip request validation
- Log sensitive information
- Mix business logic with infrastructure code

---

## 26. AI Service Integration

### Purpose

The Backend integrates with an internal AI service to handle AI-related tasks such as:
- Parsing resumes
- Parsing job descriptions  
- Scoring applications

**Important:** The Frontend must not call the AI service directly. All AI-related requests go through the Backend.

### Communication Flow

```
Frontend
  ↓
Backend API
  ↓
Backend AiService
  ↓
AI Service
```

### Integration Location

AI service integration is placed in:

```
src/integrations/ai/
├── ai.module.ts
├── ai.service.ts
└── types/
    └── ai-service.types.ts
```

| File | Purpose |
|------|---------|
| `ai.module.ts` | Configures the AI integration module and HTTP client |
| `ai.service.ts` | Contains methods for calling the AI service |
| `types/ai-service.types.ts` | Defines request and response contracts |

This layer is responsible only for communication with the AI service. Business logic remains in domain modules such as resumes, job descriptions, evaluations, and health.

### Environment Variables

```
AI_SERVICE_URL=http://localhost:8000
AI_REQUEST_TIMEOUT_MS=30000
```

| Variable | Purpose |
|----------|---------|
| `AI_SERVICE_URL` | Base URL of the AI service |
| `AI_REQUEST_TIMEOUT_MS` | Timeout for requests to the AI service |

### Backend AiService Methods

| Method | AI Endpoint | Purpose |
|--------|------------|---------|
| `checkHealth()` | `GET /health` | Checks AI service status |
| `parseResume()` | `POST /parse/resume` | Parses raw resume text |
| `parseJobDescription()` | `POST /parse/job-description` | Parses raw job description text |
| `scoreApplication()` | `POST /score/application` | Scores a resume against a job description |

### Error Handling

Errors from the AI service are mapped before being returned by the Backend. This keeps API responses consistent and prevents raw HTTP client errors from leaking to the Frontend.

#### Common Cases

| Scenario | Backend Behavior |
|----------|-----------------|
| AI service unavailable | Return external service error |
| AI request timeout | Return timeout error |
| Invalid AI response | Return integration error |
| AI service returns error | Return mapped backend error |

### Usage in Domain Flow

The AI service is called by backend domain services when needed:

- `ResumesService` calls `parseResume()`
- `JobDescriptionsService` calls `parseJobDescription()`
- `EvaluationsService` calls `scoreApplication()`
- `HealthService` may call `checkHealth()`

The Backend remains the source of truth for persisted data. AI service responses are saved into the database only through the relevant domain workflow.

### Source of Truth Rules

| Data | Source of Truth |
|------|-----------------|
| Resume parsed data | `Resume.parsedData` |
| Job description parsed data | `JobDescription.parsedData` |
| Job skills used for matching | `JobSkill` table |
| Evaluation result | `Evaluation` and related evaluation tables |

### Testing

AI service integration should be tested by running the AI service locally and executing Backend integration tests.

#### Expected Local Setup

```
AI Service: http://localhost:8000
Backend AiService integration test
```

#### Test Coverage

A successful test confirms that the Backend can call:

- AI health check
- Resume parsing
- Job description parsing
- Application scoring