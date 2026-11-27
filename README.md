# AI Recruiter Mini — Backend

NestJS API for AI Recruiter Mini, a recruitment screening platform that scores
CVs against job descriptions. It owns users, organisations, data, queues and
LLM calls. CV/JD parsing and scoring are delegated to the
[AI Service](https://github.com/DangHuuLong/Ai-Recruiter-Mini-Ai-Service).

Related repositories:
[AI Service](https://github.com/DangHuuLong/Ai-Recruiter-Mini-Ai-Service) ·
[Frontend](https://github.com/DangHuuLong/Ai-Recruiter-Mini-Frontend)

---

## Features

**Two tiers**

| | Public (anonymous) | Enterprise (organisation account) |
|---|---|---|
| Access | No login. Identified by an `x-anon-session-id` header that the server issues. | JWT, after registering an organisation and verifying the email |
| Batch scoring | N CVs × M JDs matrix, default limit 2 CVs × 10 JDs | Default limit 2,000 CVs × 50 JDs |
| Storage | Redis only, expiring after 6 h by default. Uploaded files are deleted right after parsing. | PostgreSQL, isolated per organisation |
| Extras | Feedback form | Ranking, cell detail, skill-gap summary, CSV export, cancel, promote to pipeline, e-mail or webhook on completion |

CV and JD input can be a file (PDF/DOCX, uploaded directly to Supabase through
signed URLs), free text, or a structured form.

**Enterprise recruiting pipeline.** Candidates, resumes, job descriptions and
job skills, applications with status history, AI evaluations (criteria
breakdown, skills, evidence, interview questions, retry), and per-organisation
evaluation configs (criteria weights).

**Interview question bank.** A shared, taxonomy-tagged bank stored in pgvector.
When a JD is evaluated, questions are retrieved by semantic search with hard
taxonomy filters. When too few match, an LLM generates new ones; these pass a
validation gate and are written back to the bank.

**Operations.** Audit log of sensitive actions, an AI activity log of every
call to the AI service, user feedback on AI results, the Bull Board queue
dashboard, and Redis-backed rate limits.

**Roles**

| Role | Scope |
|---|---|
| `ADMIN` | Everything in their organisation, including users, audit log and Bull Board |
| `RECRUITER` | Recruiting data and batch scoring in their organisation |
| `HIRING_MANAGER` | Read access to recruiting data; can change application status and leave feedback |
| `DEV` | Platform-owner role: interview-question bank and AI activity dashboards. It cannot be assigned through the Users API. |

---

## Architecture

```
Frontend (Next.js) ──HTTP──▶ Backend (NestJS, /api)
                              │
        ┌─────────────────────┼──────────────────────────┬────────────────────┐
        ▼                     ▼                          ▼                    ▼
  PostgreSQL + pgvector   Redis (BullMQ queues,      Supabase Storage     AI Service (FastAPI)
  via Prisma              public batch state,        (signed upload/      parse resume / JD,
  (Supabase)              rate limits)               download URLs)       score a pair

Backend ──HTTP──▶ LLM providers: Gemini (embeddings), GPT / Groq / Cerebras (question generation)
```

**Batch pipeline** (`src/queue/`):

```
POST batch ─▶ resume-parse queue ─┐
           └▶ jd-parse queue ─────┴▶ score-pair queue (one job per CV×JD cell) ─▶ notify queue
                                    BatchProgressCoordinator tracks counts and status:
                                    PENDING → PARSING → SCORING → COMPLETED / COMPLETED_WITH_ERRORS / FAILED / CANCELLED
```

- Enterprise batches persist through Prisma; public batches persist through
  Redis. Both go through the same `BatchContextStore` interface.
- Worker concurrency is configurable. Scoring is kept low (default 4) because
  the AI service's cross-encoder is the bottleneck.
- The server re-hashes uploaded files to verify the checksum the client
  declared. Parsed CVs are then cached by checksum, scoped to the organisation
  (enterprise) or the session (public).

Single evaluations (`POST /evaluations`) call the AI service synchronously.

---

## API

Every route is prefixed with `/api`. Successful responses are wrapped by a
global interceptor; errors go through a global exception filter. Swagger UI is
served at `/docs` when `NODE_ENV` is not `production`.

| Area | Routes | Access |
|---|---|---|
| Health | `GET /health` (checks DB, Redis and storage) | Public |
| Auth | `POST /auth/register-organization`, `login`, `verify-email`, `resend-verification`*, `forgot-password`*, `reset-password` | Public (* rate-limited per email) |
| Users | `GET /users/me`; `GET, POST /users`; `PATCH /users/:id` (name, role, active) | `ADMIN` (`/me`: any role) |
| Files | `POST /files/upload`; `GET /files/:id`, `/:id/download-url`; `DELETE /files/:id` | Org roles |
| Candidates | CRUD, `POST /candidates/bulk-delete`, `GET /candidates/:id/resumes`, `/:id/applications` | Org roles |
| Resumes | CRUD, `POST /resumes/:id/parse`, `GET /resumes/:id/parsed-data` | Org roles |
| Job descriptions | CRUD, `POST /job-descriptions/bulk-deactivate`, `/:id/parse`, `GET /:id/parsed-data`; skills under `/job-descriptions/:id/skills`, `/job-skills/:skillId` | Org roles |
| Applications | CRUD, `PATCH /applications/:id/status`, `GET /applications/:id/events` | Org roles |
| Evaluation configs | CRUD, `POST /evaluation-configs/bulk-delete` | Org roles |
| Evaluations | `POST /evaluations`, list and detail, `/:id/breakdown`, `/skills`, `/interview-questions`, `/evidence`, `POST /:id/retry`, `GET /applications/:id/evaluations` | Org roles |
| Scoring batches | `POST /scoring-batches/upload-urls`, `POST /scoring-batches`*, `GET /scoring-batches`, `/:id`, `/:id/matrix`, `/:id/cells/:resumeItemId/:jdItemId`, `/:id/skill-gap-summary`, `/:id/export` (CSV), `POST /:id/cancel`, `/:id/promote` | `ADMIN`, `RECRUITER` (* rate-limited per org) |
| Public batches | `POST /public/batches/upload-urls`, `POST /public/batches`*, `GET /public/batches/:id` | Anonymous session (* rate-limited per IP and session) |
| Feedback | `POST /evaluations/:id/feedback` (org roles), `POST /public/feedback` (anonymous); `GET /ai-activity-feedback`, `/:id` | Reading: `DEV` |
| AI activity log | `GET /ai-activity-logs`, `/:id`, `/stats/summary`, `/stats/timeseries` | `DEV` |
| Interview questions | CRUD, `POST /interview-questions/bulk`, `/search`, `/search-or-generate`*, `/:id/reembed` | `DEV` (* rate-limited) |
| Audit logs | `GET /audit-logs` | `ADMIN` |

"Org roles" means `ADMIN` and `RECRUITER` for writes, plus `HIRING_MANAGER`
for reads. The exact roles per route are set with `@Roles(...)` in each
controller.

The Bull Board dashboard is mounted at `/api/admin/queues`. It requires a
Bearer token for an active `ADMIN`.

More detail: [docs/api-contract.md](docs/api-contract.md),
[docs/auth-api.md](docs/auth-api.md),
[docs/evaluation-workflow.md](docs/evaluation-workflow.md).

---

## Data model

Defined in `prisma/schema.prisma`. Migrations are in `prisma/migrations/`.

- **Tenancy and auth:** `Organization`, `User`, `AuthToken` (email verification and password reset)
- **Recruiting:** `FileAsset`, `Candidate`, `Resume`, `JobDescription`, `JobSkill`, `Application`, `ApplicationEvent`
- **Evaluation:** `EvaluationConfig`, `Evaluation`, `EvaluationCriterionScore`, `EvaluationSkill`, `EvaluationInterviewQuestion`
- **Batch scoring:** `ScoringBatch`, `ScoringBatchResume`, `ScoringBatchJobDescription`, `ScoringBatchResult`
- **Question bank:** `InterviewQuestionEntry`, with a `vector(768)` embedding. Requires the `vector` (pgvector) extension, which the migration creates.
- **Observability:** `AuditLog`, `AiActivityLog`, `AiActivityFeedback`

Organisation-owned records carry an `organizationId`, and every query is
scoped to the caller's organisation.

---

## Getting started

Requirements:

- **Node.js 22**
- **PostgreSQL** with the pgvector extension available (the project uses Supabase)
- **Redis** with eviction policy `noeviction`, as recommended by BullMQ
- A **Supabase Storage** project with two buckets: `cv-files` and `file-public`
- A running [AI Service](https://github.com/DangHuuLong/Ai-Recruiter-Mini-Ai-Service)

```bash
git clone https://github.com/DangHuuLong/Ai-Recruiter-Mini-Backend.git
cd Ai-Recruiter-Mini-Backend
npm ci
cp .env.example .env        # fill in the required values below

npx prisma migrate deploy   # uses DIRECT_URL (see prisma.config.ts)
npx prisma generate
npm run start:dev
```

The API listens on <http://localhost:3000/api>. Check it with `GET /api/health`.

---

## Configuration

Environment variables are validated at startup by `src/config/env.validation.ts`.

**Required**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Runtime PostgreSQL connection (pooled) |
| `DIRECT_URL` | Direct connection used by Prisma migrations. Optional at runtime, needed for `prisma migrate`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Storage access |
| `REDIS_URL` | BullMQ, public batch state, rate limits |
| `JWT_SECRET` | At least 16 characters |

**Optional** (defaults in brackets)

| Group | Variables |
|---|---|
| App | `NODE_ENV` [development], `PORT` [3000], `FRONTEND_URL` [http://localhost:3001] (used in email links) |
| AI service | `AI_SERVICE_URL` [http://localhost:8000], `AI_REQUEST_TIMEOUT_MS` [30000] |
| Storage and uploads | `SUPABASE_BUCKET` [cv-files], `SUPABASE_PUBLIC_TEMP_BUCKET` [file-public], `MAX_FILE_SIZE_MB` [5] |
| Auth | `JWT_EXPIRES_IN_SECONDS` [86400], `EMAIL_VERIFICATION_TOKEN_TTL_SECONDS` [86400], `PASSWORD_RESET_TOKEN_TTL_SECONDS` [3600] |
| Email (SMTP) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`. If unset, emails are logged instead of sent. |
| Queue workers | `AI_PARSE_RESUME_CONCURRENCY` [8], `AI_PARSE_JD_CONCURRENCY` [8], `AI_SCORE_CONCURRENCY` [4] |
| Batch limits | `ENTERPRISE_MAX_FILES_PER_BATCH` [2000], `ENTERPRISE_MAX_JDS_PER_BATCH` [50], `PUBLIC_MAX_FILES_PER_BATCH` [2], `PUBLIC_MAX_JDS_PER_BATCH` [10], `PUBLIC_BATCH_TTL_SECONDS` [21600] |
| Rate limits (per hour) | `PUBLIC_RATE_LIMIT_MAX_BATCHES_PER_HOUR` [5], `ENTERPRISE_RATE_LIMIT_MAX_BATCHES_PER_HOUR` [20], `ENTERPRISE_RATE_LIMIT_MAX_QUESTION_SEARCHES_PER_HOUR` [100], `AUTH_RATE_LIMIT_MAX_RESEND_VERIFICATION_PER_HOUR` [3], `AUTH_RATE_LIMIT_MAX_FORGOT_PASSWORD_PER_HOUR` [3] |
| LLM providers | `GEMINI_API_KEY_1..4` and `GEMINI_EMBEDDING_MODEL` [gemini-embedding-001] (embeddings); `GPT_API_KEY_1..4` / `GPT_MODEL` [gpt-4o-mini], `GROQ_API_KEY_1..4` / `GROQ_MODEL` [llama-3.3-70b-versatile], `CEREBRAS_API_KEY_1..4` / `CEREBRAS_MODEL` [gpt-oss-120b] (question generation) |
| Question bank | `INTERVIEW_QUESTION_SIMILARITY_THRESHOLD` [0.55], `INTERVIEW_QUESTION_FALLBACK_GENERATE_COUNT` [5] |

How the LLM providers are used:

- Completion providers are tried in the order GPT → Groq → Cerebras. Within a
  provider, keys rotate on failure, and a cut-off response is continued with
  the next call.
- Providers with no keys are skipped.
- With no completion keys at all, question generation is disabled and
  evaluations fall back to the AI service's template questions.

`USE_MOCK_AI`, `GEMINI_API_KEY` and `GEMINI_MODEL` still appear in
`.env.example`, but no code reads them.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run start:dev` | Watch mode |
| `npm run build` / `npm run start:prod` | Compile to `dist/` and run `dist/src/main` |
| `npm run lint` / `npm run format` | ESLint (with `--fix`) and Prettier |
| `npm test` | Unit tests (`src/**/*.spec.ts`) |
| `npm run test:cov` | Unit tests with coverage |
| `RUN_E2E_TESTS=true npm run test:e2e` | E2E smoke test; needs a live database, Redis and Supabase |

Unit tests cover the services of every feature module, the four queue
processors, the AI service client and the audit/AI activity loggers.

---

## Docker

```bash
docker build -t ai-recruiter-backend .
docker run -p 3000:3000 --env-file .env ai-recruiter-backend
```

The multi-stage build is based on `node:22-alpine`. It runs as a non-root user
and has a healthcheck on `/api/health`.

The image does **not** run migrations. Run `npx prisma migrate deploy` against
the target database before starting a new version.

---

## Deployment

Pushing to `main` triggers the workflow in `.github/workflows` to build the
image and push it to `ghcr.io/danghuulong/ai-recruiter-mini-backend`, tagged
`latest` and with the commit SHA.

Branch flow: `feat/*`, `fix/*`, `test/*` and `docs/*` branches merge into
`develop`. A `release/x.y.z` branch is cut from `develop` and merged into
`main` to deploy.

---

## Project layout

```
src/
  main.ts            bootstrap: /api prefix, CORS, validation pipe, response interceptor, error filter, Swagger, Bull Board
  app.module.ts
  config/            typed config namespaces and Joi env validation
  common/            guards (JWT, roles, rate limits), decorators, filters, interceptors, anonymous-session middleware, DTOs
  database/prisma/   PrismaService
  integrations/
    ai/              AI service HTTP client
    llm-providers/   Gemini embeddings, multi-provider completion with key rotation
    storage/         Supabase Storage (signed URLs, cleanup)
    email/           Nodemailer service and templates
    redis/
  modules/           one folder per feature (controller, service, DTOs, specs)
  queue/             BullMQ processors, progress coordinator, batch stores, Bull Board
prisma/              schema and migrations
test/                e2e smoke test
docs/                API and workflow notes
```

---

## Known limitations

- **Duplicate generation under load.** Concurrent requests that miss the same
  question-bank bucket can each trigger LLM generation; the extra results are
  stored, not lost.
- **Old JWTs after a password reset.** Tokens issued before a reset stay valid
  until they expire.
- **Score quality.** Batch and evaluation scores are only as good as the AI
  service's model, which was trained on LLM-labelled synthetic data. See the
  AI service README.
