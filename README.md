# 🤖 AI Recruiter — Mini Backend

![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white)
![Swagger](https://img.shields.io/badge/Swagger-85EA2D?style=flat&logo=swagger&logoColor=black)
![ESLint](https://img.shields.io/badge/ESLint-4B32C3?style=flat&logo=eslint&logoColor=white)
![Prettier](https://img.shields.io/badge/Prettier-F7B93E?style=flat&logo=prettier&logoColor=black)
![REST API](https://img.shields.io/badge/REST%20API-FF6B35?style=flat&logo=fastapi&logoColor=white)

> The backend service for an AI-powered CV screening platform. Built with NestJS, PostgreSQL, and Prisma — providing a structured, explainable scoring pipeline that helps recruiters evaluate candidate fit against job descriptions.

📦 **Repository:** [github.com/DangHuuLong/Ai-Recruiter-Mini-Backend](https://github.com/DangHuuLong/Ai-Recruiter-Mini-Backend)

---

## 🌟 Overview

**AI Recruiter Mini Backend** is the server-side component of an AI-assisted CV screening system. The platform accepts candidate resumes (PDF/DOCX) and job descriptions as input, runs a structured multi-criteria evaluation pipeline, and returns a scored, explainable result to support recruiter decision-making.

The system is designed around a clear domain model — Candidate, Resume, JobDescription, Application, and Evaluation — with a modular NestJS architecture, consistent API response format, and Swagger documentation available out of the box.

> 🚧 This project is currently in active MVP development.

---

## ✨ Highlights

- 🏗️ **Modular NestJS architecture** with cleanly separated domain modules
- 🗄️ **PostgreSQL + Prisma ORM** for type-safe database access
- 📐 **Consistent API contract** via global response interceptor and exception filter
- 📋 **Swagger documentation** at `/docs` for all endpoints
- 🔍 **Multi-criteria scoring engine** with weighted, explainable breakdown
- 🤖 **AI integration layer** for parsing, semantic matching, and content generation
- 🔒 **Evidence-based evaluation** — all scores tied to extracted CV/JD data
- 🧹 **ESLint + Prettier** enforced across the entire codebase

---

## 🎯 System Purpose

The backend supports a complete screening workflow:

1. Upload and parse candidate CVs → structured JSON
2. Store and parse job descriptions → structured requirements
3. Link candidates to jobs through Applications
4. Run AI-powered Evaluations with configurable scoring criteria
5. Return score breakdown, matched/missing skills, interview questions, and audit logs

The scoring model is criterion-based and evidence-linked — not a black-box LLM score.

---

## 🧩 Domain Model

```
Candidate ──< Resume
    │
    └──< Application >── JobDescription
              │                │
              │                └──< JobSkill
              │
              └──< Evaluation >── EvaluationConfig
                        │
                        ├──< EvaluationCriterionScore   (source of truth: score breakdown)
                        ├──< EvaluationSkill             (matched / missing / related)
                        ├──< EvaluationInterviewQuestion (source of truth: interview Qs)
                        └──< ApplicationEvent            (append-only audit log)
```

### 🔑 Key Concepts

| Entity | Role |
|--------|------|
| `Candidate` | A real applicant / person |
| `Resume` | One uploaded CV file belonging to a Candidate |
| `JobDescription` | One job posting / JD |
| `JobSkill` | Structured skills extracted from a JD |
| `Application` | A Candidate applying to a JD using a specific Resume |
| `EvaluationConfig` | Scoring weights and criteria configuration |
| `Evaluation` | One AI scoring run for one Application |
| `EvaluationCriterionScore` | Per-criterion score — source of truth for score breakdown |
| `EvaluationInterviewQuestion` | Generated questions — source of truth for interview Qs |
| `ApplicationEvent` | Append-only audit log for application lifecycle |

> Never confuse `Candidate` with `Resume`. Never confuse `Application` with `Evaluation`.

---

## 📊 Scoring Model

The evaluation uses five weighted criteria that sum to **100%**:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| `SKILLS_MATCH` | 35% | Required and preferred skills alignment |
| `EXPERIENCE_RELEVANCE` | 30% | Years, seniority, domain relevance |
| `PROJECT_RELEVANCE` | 15% | Relevant projects and technologies used |
| `EDUCATION_CERTIFICATION` | 10% | Degree, field, professional certifications |
| `KEYWORD_DOMAIN_ALIGNMENT` | 10% | Industry keywords and domain context |

**Score formula:**
```
overallScore = Σ(scoreNormalized × weight) × 100
```

- `scoreNormalized` range: `0.0 – 1.0` per criterion
- `overallScore` range: `0.0 – 100.0`
- `overallScore` is a computed cache derived from `EvaluationCriterionScore` rows
- Weights are configurable via `EvaluationConfig` — not hard-coded

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────┐
│           Next.js Frontend               │
└─────────────────┬────────────────────────┘
                  │ REST API
                  ▼
┌──────────────────────────────────────────┐
│         NestJS Backend (this repo)       │
│                                          │
│  Presentation → Services → Prisma ORM   │
│                                          │
│  modules/            integrations/       │
│  ├── candidates      ├── ai/             │
│  ├── resumes         ├── parsing/        │
│  ├── job-descriptions└── storage/        │
│  ├── applications                        │
│  ├── evaluations                         │
│  │   ├── scoring/                        │
│  │   ├── matching/                       │
│  │   ├── parsing/                        │
│  │   └── generation/                     │
│  └── files                               │
└──────────┬───────────────────────────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
PostgreSQL     AI / LLM
(Prisma ORM)   Integrations
```

---

## 📁 Project Structure

```
Ai-Recruiter-Mini-Backend/
├── prisma/
│   └── schema.prisma                  # Database schema
│
├── src/
│   ├── common/
│   │   ├── constants/
│   │   ├── decorators/
│   │   ├── dto/
│   │   ├── enums/
│   │   ├── exceptions/
│   │   │   └── app.exception.ts       # Custom business exception
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts  # Global error filter
│   │   ├── guards/
│   │   ├── interceptors/
│   │   │   └── transform-response.interceptor.ts  # Global response wrapper
│   │   ├── pipes/
│   │   ├── types/
│   │   └── utils/
│   │
│   ├── config/
│   │   ├── app.config.ts
│   │   ├── database.config.ts
│   │   └── env.validation.ts
│   │
│   ├── database/
│   │   └── prisma/
│   │       ├── prisma.module.ts
│   │       └── prisma.service.ts
│   │
│   ├── integrations/
│   │   ├── ai/                        # LLM provider integration
│   │   ├── parsing/                   # CV/JD parsing integration
│   │   └── storage/                   # File storage integration
│   │
│   ├── modules/
│   │   ├── applications/
│   │   │   ├── dto/
│   │   │   ├── applications.controller.ts
│   │   │   ├── applications.module.ts
│   │   │   └── applications.service.ts
│   │   │
│   │   ├── candidates/
│   │   │   ├── dto/
│   │   │   ├── candidates.controller.ts
│   │   │   ├── candidates.module.ts
│   │   │   └── candidates.service.ts
│   │   │
│   │   ├── evaluations/
│   │   │   ├── dto/
│   │   │   ├── generation/
│   │   │   │   └── generation.service.ts
│   │   │   ├── matching/
│   │   │   │   └── matching.service.ts
│   │   │   ├── parsing/
│   │   │   │   └── parsing.service.ts
│   │   │   ├── scoring/
│   │   │   │   └── scoring.service.ts
│   │   │   ├── evaluations.controller.ts
│   │   │   ├── evaluations.module.ts
│   │   │   └── evaluations.service.ts
│   │   │
│   │   ├── files/
│   │   │   ├── dto/
│   │   │   ├── files.controller.ts
│   │   │   ├── files.module.ts
│   │   │   └── files.service.ts
│   │   │
│   │   ├── health/
│   │   │   ├── health.controller.ts
│   │   │   ├── health.module.ts
│   │   │   └── health.service.ts
│   │   │
│   │   ├── job-descriptions/
│   │   │   ├── dto/
│   │   │   ├── job-descriptions.controller.ts
│   │   │   ├── job-descriptions.module.ts
│   │   │   └── job-descriptions.service.ts
│   │   │
│   │   └── resumes/
│   │       ├── dto/
│   │       ├── resumes.controller.ts
│   │       ├── resumes.module.ts
│   │       └── resumes.service.ts
│   │
│   ├── app.module.ts
│   └── main.ts
│
├── test/
├── .prettierrc
├── .prettierignore
├── eslint.config.mjs
├── nest-cli.json
├── package.json
└── README.md
```

---

## 🔄 Evaluation Pipeline

```
Upload CV + Enter JD
       │
       ▼
  File Service         → store file, extract raw text
       │
       ▼
  Parsing Service      → CV → parsedData JSON
  Parsing Service      → JD → parsedData JSON + JobSkill rows
       │
       ▼
  Application created  → links Candidate + JobDescription + Resume
       │
       ▼
  Evaluation triggered
       │
  ┌────┴──────────────────────────────┐
  │  matching.service    semantic CV↔JD match         │
  │  scoring.service     per-criterion scores          │
  │  generation.service  explanation + interview Qs    │
  └────┬──────────────────────────────┘
       │
       ▼
  EvaluationCriterionScore rows saved  (source of truth)
  EvaluationInterviewQuestion rows saved
  EvaluationSkill rows saved (MATCHED / MISSING / RELATED)
  Evaluation.overallScore computed and cached
       │
       ▼
  Result returned to frontend
  ApplicationEvent logged (EVALUATION_COMPLETED)
```

---

## 🌐 API Response Format

All endpoints return a consistent response shape via a global interceptor and exception filter.

### ✅ Success Response
```json
{
  "success": true,
  "message": "OK",
  "data": { ... },
  "meta": { ... }
}
```

### ❌ Error Response
```json
{
  "success": false,
  "message": "Validation failed",
  "error": "BAD_REQUEST",
  "details": [ ... ]
}
```

This contract is enforced globally:
- `TransformResponseInterceptor` — wraps all successful responses automatically
- `HttpExceptionFilter` — normalizes all errors (validation, business, HTTP, runtime)
- `AppException` — custom business exception for throwing domain-level errors
- Controllers and services return plain business data — no manual wrapping needed

---

## 📖 API Documentation

Swagger UI is available at:

```
http://localhost:3000/docs
```

Swagger documents all endpoints, DTOs, request bodies, query parameters, and response shapes. It is the primary reference for frontend-backend integration during development.

---

## 🚀 Getting Started

### ✅ Prerequisites

- Node.js 18+
- PostgreSQL running locally or via a cloud provider
- npm or yarn

### 📦 Installation

```bash
# Clone the repository
git clone https://github.com/DangHuuLong/Ai-Recruiter-Mini-Backend.git
cd Ai-Recruiter-Mini-Backend

# Install dependencies
npm install
```

### ⚙️ Environment Configuration

Create a `.env` file at the project root. Required variables include the database connection URL and any AI integration credentials. Refer to `src/config/env.validation.ts` for the full list of expected environment variables.

```env
DATABASE_URL="postgresql://user:password@localhost:5432/ai_recruiter"
PORT=3000
# Add AI provider keys as needed
```

### 🗄️ Database Setup

```bash
# Push schema to database
npx prisma db push

# Or run migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate
```

### ▶️ Run the App

```bash
# Development
npm run start:dev

# Production build
npm run build
npm run start:prod
```

The server starts at `http://localhost:3000`.
Swagger docs are available at `http://localhost:3000/docs`.

---

## 📜 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run start:dev` | Start in development mode with hot reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run start:prod` | Start compiled production server |
| `npm run lint` | Run ESLint across the codebase |
| `npm run format` | Format all files with Prettier |
| `npm run format:check` | Check formatting without writing changes |

---

## 🧹 Code Quality

The project enforces consistent code style from the start:

- **ESLint** — configured via `eslint.config.mjs` with NestJS-compatible rules. Catches unused variables, import issues, and common convention violations.
- **Prettier** — configured via `.prettierrc`. Ensures uniform formatting across all TypeScript files.

Run both before committing:

```bash
npm run lint
npm run format
```

---

## 📐 Architecture Principles

| Principle | Application |
|-----------|-------------|
| Separation of concerns | Each module owns one domain; cross-cutting code lives in `common/` |
| Source-of-truth discipline | `EvaluationCriterionScore` for scores; `EvaluationInterviewQuestion` for questions |
| Evidence-based scoring | Every criterion score is tied to extracted evidence |
| Explainability | `overallScore` is derived — never manually authored |
| Append-only audit | `ApplicationEvent` is never updated or deleted |
| Config-driven weights | Scoring weights come from `EvaluationConfig`, not hard-coded |

---

## 📌 Current Status

| Area | Status |
|------|--------|
| Project scaffold & module structure | ✅ Complete |
| Prisma schema & database setup | ✅ Complete |
| ESLint + Prettier configuration | ✅ Complete |
| Global response interceptor | ✅ Complete |
| Global exception filter | ✅ Complete |
| Swagger setup | ✅ Complete |
| CV / JD parsing pipeline | 🔄 In progress |
| Scoring engine | 🔄 In progress |
| AI integration layer | 🔄 In progress |
| Full evaluation workflow | 🔄 In progress |

---

## 🔮 Future Improvements

- 🔐 Authentication and role-based access control (recruiter / admin)
- 📦 Batch evaluation support for multiple candidates per JD
- 📊 Analytics dashboard APIs for hiring metrics
- 🌐 Webhook support for async evaluation completion
- 🐳 Docker setup for local development and deployment
- 🧪 Expanded unit and integration test coverage
- 🔁 Refresh token and session management

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/DangHuuLong">DangHuuLong</a> using NestJS, PostgreSQL & Prisma
  <br/>
  <a href="https://github.com/DangHuuLong/Ai-Recruiter-Mini-Backend">Repository</a>
</p>
