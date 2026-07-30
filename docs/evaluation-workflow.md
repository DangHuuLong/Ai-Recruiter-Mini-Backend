# Backend Evaluation Workflow

This document describes how the Backend handles resume parsing, application evaluation, persistence, and API responses for AI Recruiter Mini.

## Overview

The Backend is the only service called by the Frontend. The Backend calls the AI Service internally for resume parsing, job description parsing, and application scoring.

```text
Frontend -> Backend -> AI Service
```

## Main modules

| Module | Responsibility |
| --- | --- |
| `resumes` | Stores resumes, tracks parse status, and persists parsed resume data. |
| `job-descriptions` | Stores job descriptions, tracks parse status, and persists parsed JD data and skills. |
| `applications` | Links candidate, resume, and job description. |
| `evaluations` | Creates evaluations, calls the AI scoring API, persists scores, skills, evidence, and questions. |
| `integrations/ai` | HTTP client wrapper for AI Service endpoints. |
| `integrations/storage` | Supabase Storage helper for uploaded files and signed URLs. |

## Resume parse flow

1. Frontend uploads a resume file and creates a `FileAsset`.
2. Frontend creates a `Resume` linked to a candidate and file asset.
3. Backend marks the resume as `PROCESSING` before parsing.
4. Backend creates a signed URL for the stored file.
5. Backend sends resume metadata and signed URL to the AI Service.
6. AI Service extracts text and returns parsed resume data.
7. Backend saves:
   - `rawText`
   - `parsedData`
   - `parserVersion`
   - `parseStatus = SUCCESS`
8. Backend updates candidate `normalizedProfile` from parsed resume data.

## Current AI resume parse contract

The Backend sends this payload to `POST /parse/resume` on the AI Service:

```json
{
  "resume_id": "resume-id",
  "file_name": "candidate-cv.pdf",
  "file_type": "PDF",
  "signed_url": "https://signed-url",
  "checksum": null
}
```

Expected AI Service response data:

```json
{
  "raw_text": "Extracted resume text",
  "parsed_data": {},
  "parser_version": "ai-document-resume-parser-v1",
  "warnings": [],
  "confidence": 0.9,
  "text_extraction_method": "pdf"
}
```

## Job description parse flow

1. Backend receives raw JD text.
2. Backend sends `raw_text` to AI Service `POST /parse/job-description`.
3. Backend saves parsed data and extracted skills.
4. Backend marks the job description as `SUCCESS` when parsing succeeds.

## Evaluation create flow

1. Frontend calls `POST /evaluations` with `applicationId`.
2. Backend loads the application with resume and job description.
3. Backend validates:
   - Application exists.
   - Resume parse status is `SUCCESS`.
   - Resume parsed data exists.
   - Job description parse status is `SUCCESS`.
   - Job description parsed data exists.
   - Job description has skills.
4. Backend creates an evaluation with `PROCESSING` status.
5. Backend calls AI Service `POST /score/application`.
6. Backend persists successful result into:
   - `Evaluation`
   - `EvaluationCriterionScore`
   - `EvaluationSkill`
   - `EvaluationInterviewQuestion`
   - `ApplicationEvent`
7. Backend marks evaluation as `COMPLETED`.
8. If scoring fails, Backend marks evaluation as `FAILED` and stores `evaluationError`.

## Backend API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/evaluations` | Create and run an evaluation. |
| `GET` | `/evaluations` | List evaluations. |
| `GET` | `/evaluations/:id` | Get one evaluation with related data. |
| `GET` | `/applications/:id/evaluations` | List evaluations for an application. |
| `GET` | `/evaluations/:id/breakdown` | Get criterion score rows. |
| `GET` | `/evaluations/:id/skills` | Get matched, related, and missing skills. |
| `GET` | `/evaluations/:id/interview-questions` | Get generated interview questions. |
| `GET` | `/evaluations/:id/evidence` | Get evidence map and related evidence rows. |
| `POST` | `/evaluations/:id/retry` | Retry a failed or completed evaluation. |

## Evaluation result fields

The evaluation response includes:

- `overallScore`
- `summary`
- `explanation`
- `skillGapSummary`
- `evidenceMap`
- `evaluationError`
- `criterionScores`
- `skills`
- `interviewQuestionRows`
- `application`
- `config`
- `createdBy`

## Overall score calculation

The Backend persists criterion rows from the AI Service and calculates the final score as:

```text
sum(scoreNormalized * weight * 100)
```

The result is rounded to two decimal places.

## Failure behavior

Evaluation creation can fail when:

- Resume is not parsed successfully.
- Resume parsed data is missing.
- Job description is not parsed successfully.
- Job description parsed data is missing.
- Job description has no skills.
- AI Service is unavailable or returns an error.

When evaluation scoring fails after the evaluation row is created:

- Evaluation status becomes `FAILED`.
- `evaluationError` is stored.
- An `EVALUATION_FAILED` application event is created.

## Retry behavior

`POST /evaluations/:id/retry`:

1. Rejects retry when evaluation is already `PROCESSING`.
2. Deletes old criterion scores, skills, and interview question rows.
3. Resets evaluation fields.
4. Runs scoring again.
5. Persists the new result.

## Manual backend test checklist

1. Start Backend, AI Service, database, and storage.
2. Upload a resume file.
3. Create a candidate and resume record.
4. Parse resume and confirm `parseStatus = SUCCESS`.
5. Create and parse a job description.
6. Confirm job description has required and preferred skills.
7. Create an application linking candidate, resume, and job description.
8. Call `POST /evaluations` with the application ID.
9. Confirm evaluation is `COMPLETED` or `FAILED` with useful error details.
10. Fetch `GET /evaluations/:id` and verify score, breakdown, skills, evidence, and questions.
11. Test retry with `POST /evaluations/:id/retry`.

## Debugging notes

### AI Service returns 422 on `/parse/resume`

This usually means the Backend and AI Service resume parse contract are out of sync. The current contract requires `resume_id`, `file_name`, `file_type`, `signed_url`, and optional `checksum`.

### Evaluation score looks too low

Check the AI Service parsed resume and scoring output first. The Backend stores and returns the score it receives from the scoring pipeline.

### Resume parse looks incorrect

Check AI Service text extraction and parsing quality, especially for PDFs with custom fonts, Vietnamese text, and multi-column layouts.
