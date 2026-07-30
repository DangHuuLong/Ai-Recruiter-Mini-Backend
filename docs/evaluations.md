# Evaluations

**Project:** AI Recruiter Mini — Evaluation Module  
**Framework:** NestJS · TypeScript · PostgreSQL · Prisma ORM  
**Scope:** Application scoring, score breakdown, matched/missing skills, evidence, and interview question generation.

---

## 1. Purpose

The **Evaluations module** scores one candidate application against one job description.

An evaluation combines data from:

- the selected `Application`
- the candidate `Resume`
- the target `JobDescription`
- optional `EvaluationConfig`
- AI scoring output

The result is persisted into `Evaluation` and related evaluation tables so the frontend can show summary, score breakdown, matched skills, missing skills, evidence, and suggested interview questions.

---

## 2. Main Responsibilities

The module is responsible for:

- validating that the application exists
- validating that the resume has been parsed successfully
- validating that the job description has been parsed successfully
- resolving the scoring config to use
- calling the AI service to score the application
- saving the final evaluation result
- saving per-criterion score breakdown
- saving matched, missing, and related skills
- saving generated interview questions
- exposing lightweight list endpoints
- exposing detail endpoints for breakdown, skills, evidence, and questions
- supporting retry for existing evaluations

---

## 3. Core Models

### Evaluation

Represents one scoring run for one application.

Key fields:

| Field | Purpose |
|---|---|
| `applicationId` | Application being evaluated |
| `configId` | Optional evaluation config used for scoring |
| `createdById` | Optional user who triggered the evaluation |
| `status` | `PENDING`, `PROCESSING`, `COMPLETED`, or `FAILED` |
| `overallScore` | Cached final score from 0 to 100 |
| `summary` | Short scoring summary |
| `explanation` | Full scoring explanation |
| `skillGapSummary` | Summary of missing or weak skills |
| `interviewQuestions` | Optional JSON snapshot of generated questions |
| `evidenceMap` | Evidence grouped by scoring output |
| `evaluationError` | Error message if scoring failed |
| `startedAt` | Scoring start time |
| `completedAt` | Scoring completion time |

### EvaluationCriterionScore

Stores one score row per scoring criterion.

Examples:

- `SKILLS_MATCH`
- `EXPERIENCE_RELEVANCE`
- `PROJECT_RELEVANCE`
- `EDUCATION_CERTIFICATION`
- `KEYWORD_DOMAIN_ALIGNMENT`

This table is the source of truth for score breakdown.

### EvaluationSkill

Stores skill-level scoring result.

Supported skill types:

- `MATCHED`
- `MISSING`
- `RELATED`

This table is the source of truth for matched and missing skills.

### EvaluationInterviewQuestion

Stores generated interview questions for the evaluation.

This table is the source of truth for interview questions.

### EvaluationConfig

Defines scoring criteria and weights.

A config can be:

- scoped to a specific job description through `jobDescriptionId`
- global when `jobDescriptionId` is `null`
- marked as default with `isDefault = true`

If no config is passed to evaluation creation, the service tries to use the default config. If no config exists, it falls back to built-in default criteria.

---

## 4. Default Scoring Criteria

If no database config is resolved, the service uses these default weights:

| Criterion | Weight | Purpose |
|---|---:|---|
| `SKILLS_MATCH` | 0.35 | Measures required and preferred skill alignment |
| `EXPERIENCE_RELEVANCE` | 0.30 | Measures work experience relevance |
| `PROJECT_RELEVANCE` | 0.15 | Measures project relevance |
| `EDUCATION_CERTIFICATION` | 0.10 | Measures education and certification fit |
| `KEYWORD_DOMAIN_ALIGNMENT` | 0.10 | Measures keyword and domain alignment |

Total weight should equal `1.0`.

---

## 5. Overall Score Formula

Each criterion score is normalized from `0` to `1`.

The final score is calculated as:

```txt
overallScore = sum(scoreNormalized * weight * 100)
```

Example:

```txt
SKILLS_MATCH scoreNormalized = 0.80
SKILLS_MATCH weight = 0.35
Contribution = 0.80 * 0.35 * 100 = 28
```

The final `overallScore` is rounded to two decimal places.

---

## 6. Create Evaluation Flow

Endpoint:

```txt
POST /api/evaluations
```

High-level flow:

```txt
Create evaluation request
  ↓
Load application with resume and job description
  ↓
Validate application exists
  ↓
Validate resume.parseStatus = SUCCESS
  ↓
Validate resume.parsedData exists
  ↓
Validate jobDescription.parseStatus = SUCCESS
  ↓
Validate jobDescription.parsedData exists
  ↓
Validate job description has skills
  ↓
Resolve EvaluationConfig or fallback to default criteria
  ↓
Create Evaluation with status = PROCESSING
  ↓
Call AI service scoreApplication()
  ↓
Persist criterion scores
  ↓
Persist matched/missing/related skills
  ↓
Persist interview questions
  ↓
Update Evaluation to COMPLETED
  ↓
Create ApplicationEvent EVALUATION_COMPLETED
  ↓
Return evaluation detail
```

If AI scoring fails:

```txt
AI scoring error
  ↓
Update Evaluation to FAILED
  ↓
Save evaluationError
  ↓
Create ApplicationEvent EVALUATION_FAILED
  ↓
Return mapped error response
```

---

## 7. Retry Evaluation Flow

Endpoint:

```txt
POST /api/evaluations/:id/retry
```

Retry is used to run scoring again for an existing evaluation.

Flow:

```txt
Load evaluation
  ↓
Reject if evaluation does not exist
  ↓
Reject if status = PROCESSING
  ↓
Build scoring context again
  ↓
Delete old criterion scores
  ↓
Delete old evaluation skills
  ↓
Delete old interview questions
  ↓
Reset evaluation fields
  ↓
Set status = PROCESSING
  ↓
Call AI scoring again
  ↓
Persist new results
  ↓
Return updated evaluation detail
```

Retry keeps the same `evaluation.id` but replaces generated scoring rows.

---

## 8. API Endpoints

### Create Evaluation

```txt
POST /api/evaluations
```

Body:

```json
{
  "applicationId": "application_id",
  "configId": "optional_config_id",
  "createdById": "optional_user_id"
}
```

Returns the created evaluation detail.

### List Evaluations

```txt
GET /api/evaluations?page=1&limit=10&sortBy=createdAt&sortOrder=desc
```

Supported filters:

| Query | Purpose |
|---|---|
| `page` | Current page |
| `limit` | Page size |
| `search` | Search by evaluation summary/error, candidate, job description, or config |
| `applicationId` | Filter by application |
| `configId` | Filter by evaluation config |
| `createdById` | Filter by creator |
| `status` | Filter by evaluation status |
| `sortBy` | Sort field |
| `sortOrder` | `asc` or `desc` |

Search currently checks:

- evaluation `id`
- `summary`
- `skillGapSummary`
- `evaluationError`
- application candidate `fullName`, `primaryEmail`, `primaryPhone`
- application job description `title`, `companyName`, `department`
- config `name`, `description`, `version`

Example:

```txt
GET /api/evaluations?page=1&limit=10&status=COMPLETED&search=backend&sortBy=overallScore&sortOrder=desc
```

This endpoint must return a lightweight payload.

It should not include heavy nested rows such as:

- `criterionScores`
- `skills`
- `interviewQuestionRows`
- `resume`
- `jobDescription.rawText`
- `jobDescription.parsedData`
- `config.criteriaDefinition`
- `evidenceMap`
- `interviewQuestions`

### Get Evaluation Detail

```txt
GET /api/evaluations/:id
```

Returns full detail for one evaluation.

This endpoint may include:

- application
- candidate
- resume
- job description
- config
- criterion scores
- skills
- interview question rows

### Get Evaluations By Application

```txt
GET /api/applications/:applicationId/evaluations
```

Returns all evaluations for one application.

This endpoint can return multiple records, so it should also use a lightweight select.

### Get Score Breakdown

```txt
GET /api/evaluations/:id/breakdown
```

Returns rows from `EvaluationCriterionScore`.

### Get Evaluation Skills

```txt
GET /api/evaluations/:id/skills
```

Returns rows from `EvaluationSkill`, including matched and missing skills.

### Get Interview Questions

```txt
GET /api/evaluations/:id/interview-questions
```

Returns rows from `EvaluationInterviewQuestion`, ordered by `displayOrder` and `createdAt`.

### Get Evidence

```txt
GET /api/evaluations/:id/evidence
```

Returns evidence-focused data only:

- `evidenceMap`
- criterion score evidence
- skill evidence

### Retry Evaluation

```txt
POST /api/evaluations/:id/retry
```

Runs scoring again for an existing evaluation.

---

## 9. Lightweight List Response Rule

List endpoints must not use the same include shape as detail endpoints.

Bad pattern:

```typescript
include: this.getEvaluationInclude()
```

This is too heavy for list endpoints because it pulls resume, job description, config, criterion scores, skills, and questions for every evaluation row.

Preferred pattern:

```typescript
select: this.getEvaluationListSelect()
```

The list select should include only summary fields required for table rendering, such as:

- evaluation ID
- status
- overall score
- summary
- skill gap summary
- timestamps
- application summary
- candidate summary
- job description summary
- config summary
- creator summary

Detail data should be fetched only when the user opens a specific evaluation.

---

## 10. Source of Truth Rules

| Data | Source of Truth |
|---|---|
| Final score | `Evaluation.overallScore` as cached value |
| Score breakdown | `EvaluationCriterionScore` |
| Matched/missing skills | `EvaluationSkill` |
| Interview questions | `EvaluationInterviewQuestion` |
| Evidence map | `Evaluation.evidenceMap` |
| Application state changes | `ApplicationEvent` |
| Job skills for matching | `JobSkill` |
| Parsed resume | `Resume.parsedData` |
| Parsed job description | `JobDescription.parsedData` |

---

## 11. AI Service Integration

The evaluation module calls the AI integration layer through:

```typescript
this.aiService.scoreApplication(resumeData, jobDescriptionData, criteria)
```

Expected output shape is `EvaluationResult`.

The output should include:

- `summary`
- `explanation`
- `skill_gap_summary`
- `criteria`
- `skills`
- `strong_points`
- `weak_points`
- `evidence_map`
- `interview_questions`

The backend does not trust AI output blindly. It normalizes and validates values before saving:

- criterion names are converted to `CriterionName`
- skill match types are converted to `SkillMatchType`
- scores are clamped between `0` and `1`
- weights are clamped between `0` and `1`
- JSON arrays and objects are normalized before persistence

---

## 12. Application Events

The evaluation module writes application lifecycle events.

### Completed Event

```txt
EVALUATION_COMPLETED
```

Event payload:

```json
{
  "evaluationId": "evaluation_id",
  "status": "COMPLETED",
  "overallScore": 58.09
}
```

### Failed Event

```txt
EVALUATION_FAILED
```

Event payload:

```json
{
  "evaluationId": "evaluation_id",
  "error": "AI service is unavailable"
}
```

---

## 13. Common Happy Case

A successful evaluation should produce:

- `Evaluation.status = COMPLETED`
- `Evaluation.overallScore` as a number from `0` to `100`
- five criterion score rows
- matched skills
- missing skills
- interview questions
- evidence map
- completed timestamp
- application event `EVALUATION_COMPLETED`

Example mock result:

```txt
status = COMPLETED
overallScore = 58.09
summary = Mock evaluation result for the application.
skillGapSummary = Missing skills: Node.js, NestJS, Next.js, Redis, CI/CD...
```

---

## 14. Common Failure Cases

| Scenario | Response |
|---|---|
| Application not found | `404 Application not found` |
| Resume parse status is not success | `409 Resume has not been parsed successfully` |
| Resume parsed data is missing | `409 Resume parsed data is missing` |
| Job description parse status is not success | `409 Job description has not been parsed successfully` |
| Job description parsed data is missing | `409 Job description parsed data is missing` |
| Job description has no skills | `409 Job description has no skills for evaluation` |
| Config not found | `404 Evaluation config not found` |
| Config belongs to another job description | `409 Evaluation config does not belong to this job description` |
| Evaluation not found | `404 Evaluation not found` |
| Retry while processing | `409 Evaluation is already processing` |
| AI service unavailable | `502 AI service is unavailable` |

---

## 15. Postman Testing Checklist

Recommended happy case order:

```txt
1. POST /api/evaluations
2. GET /api/evaluations?page=1&limit=10
3. GET /api/applications/:applicationId/evaluations
4. GET /api/evaluations/:id
5. GET /api/evaluations/:id/breakdown
6. GET /api/evaluations/:id/skills
7. GET /api/evaluations/:id/interview-questions
8. GET /api/evaluations/:id/evidence
9. POST /api/evaluations/:id/retry
10. GET /api/evaluations/:id again
```

List endpoints pass if they do not return heavy detail fields.

Detail endpoints pass if they return complete evaluation data.

---

## 16. Performance Notes

Evaluation list endpoints can grow quickly because each evaluation can have:

- five criterion score rows
- many matched/missing skill rows
- multiple interview questions
- large resume data
- large job description data
- config JSON
- evidence JSON

For this reason:

- list endpoints should use lightweight `select`
- detail endpoint should use full include
- breakdown, skills, questions, and evidence should remain separate endpoints
- frontend should request details lazily when the user opens one evaluation

---

## 17. Implementation Notes

Important service methods:

| Method | Purpose |
|---|---|
| `create()` | Creates and scores a new evaluation |
| `findAll()` | Lists evaluations with pagination and lightweight select |
| `findOne()` | Gets full evaluation detail |
| `findByApplicationId()` | Lists evaluations for one application with lightweight select |
| `findBreakdown()` | Gets criterion score rows |
| `findSkills()` | Gets skill rows |
| `findInterviewQuestions()` | Gets generated question rows |
| `findEvidence()` | Gets evidence-focused data |
| `retry()` | Re-runs scoring for an existing evaluation |
| `buildScoringContext()` | Loads and validates application, resume, JD, user, and config |
| `resolveEvaluationConfig()` | Finds explicit or default evaluation config |
| `persistSuccessfulEvaluation()` | Saves all successful AI scoring output |
| `scoreAndPersistEvaluation()` | Calls AI service and handles success/failure persistence |

---

## 18. Key Design Principle

Use separate response shapes for different use cases:

```txt
List page       → lightweight select
Detail page     → full include
Breakdown tab   → criterion score endpoint
Skills tab      → skills endpoint
Questions tab   → interview question endpoint
Evidence tab    → evidence endpoint
```

This keeps the API responsive as the number of evaluations grows.
