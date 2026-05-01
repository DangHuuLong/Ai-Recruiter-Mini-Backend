# Job Descriptions

This document describes the current design and expected behavior of the `JobDescription` domain in the backend.

Use this file as the main documentation place for future changes, decisions, limitations, and issues related to job descriptions.

## Current Scope

A `JobDescription` represents one job posting or one hiring position.

Examples:

- Backend Developer
- Frontend Developer
- QA Engineer
- Product Designer

If a recruiter wants to hire for multiple positions, each position should be created as a separate `JobDescription` record.

Do not store multiple different job roles inside one job description.

## Current Input Flow

At the current stage, job descriptions are entered manually by the user or recruiter.

The expected flow is:

```text
Recruiter enters job information in the frontend form
-> Frontend sends the data to the backend
-> Backend stores a JobDescription record
```

The current API does not support uploading JD files such as PDF or DOCX.

## Manual Input Fields

The current `POST /api/job-descriptions` API accepts structured fields such as:

- `title`
- `companyName`
- `department`
- `location`
- `employmentType`
- `seniority`
- `rawText`
- `parserVersion`
- `createdById`

The most important field is `rawText`, because it stores the original JD content entered or pasted by the recruiter.

## Raw Text Responsibility

`rawText` is the source text for the job description.

Even when the recruiter enters structured fields manually, `rawText` should still be stored because it can be used later for:

- AI Service job description parsing
- extracting required skills
- extracting preferred skills
- generating `JobSkill` rows
- matching against candidate resumes
- debugging JD parsing or scoring issues
- auditing what the recruiter originally entered

## JD Parsing Implementation

The backend now includes JD parsing endpoints.

```text
POST /api/job-descriptions/:id/parse
GET  /api/job-descriptions/:id/parsed-data
```

The parse endpoint is responsible for coordinating the parsing lifecycle on the backend side.

Current backend flow:

```text
POST /api/job-descriptions/:id/parse
-> Backend checks that the JobDescription exists and isActive = true
-> Backend sets parseStatus = PROCESSING
-> Backend clears parsingError
-> Backend calls AiService.parseJobDescription(rawText)
-> If AI parsing succeeds:
   - save parsedData
   - save parserVersion
   - set parseStatus = SUCCESS
   - clear parsingError
-> If AI parsing fails:
   - set parseStatus = FAILED
   - save parsingError
   - return the error response to the client
```

The current backend parser version value is:

```text
ai-job-description-parser-v1
```

## Current JD Parsing Dependency

The backend endpoint is implemented, but the happy path depends on the AI Service endpoint:

```text
POST /parse/job-description
```

This means `POST /api/job-descriptions/:id/parse` can only return a successful parse result when the AI Service already supports job description parsing.

Until the AI Service implementation is completed, the backend parse endpoint can still be tested for failure handling:

```text
POST /api/job-descriptions/:id/parse
-> calls AI Service
-> AI Service does not support JD parsing yet or is unavailable
-> backend sets parseStatus = FAILED
-> backend stores parsingError
```

This is expected during the current development stage.

## Parsed Data Endpoint

The parsed data endpoint can be tested even before AI parsing is fully available.

```text
GET /api/job-descriptions/:id/parsed-data
```

It returns the parsing state for one active job description:

```text
id
title
rawText
parsedData
parseStatus
parserVersion
parsingError
updatedAt
```

Before parsing, the expected state is usually:

```text
parseStatus = PENDING
parsedData = null
parserVersion = null
parsingError = null
```

After a failed parse attempt, the expected state is:

```text
parseStatus = FAILED
parsedData = null
parsingError = <error message>
```

After a successful parse attempt, the expected state is:

```text
parseStatus = SUCCESS
parsedData = <structured JD data returned by AI Service>
parserVersion = ai-job-description-parser-v1
parsingError = null
```

## Parsed Data Responsibility

The `parsedData` field is intended to store structured data extracted from the JD, such as:

- responsibilities
- requirements
- nice-to-have qualifications
- minimum experience years
- education requirement
- domain keywords
- required skills
- preferred skills

At the current stage, the backend stores `parsedData` as returned by the AI Service.

It does not yet automatically create or update `JobSkill` rows from `parsedData`.

## JobSkill Responsibility

`JobSkill` rows are the structured skill source extracted from a job description.

They are preferred over reading skills directly from `parsedData` at scoring time.

Expected skill types:

- `REQUIRED`
- `PREFERRED`

A `JobSkill` can also include:

- normalized name
- core skill flag
- weight hint

These fields are useful for matching and scoring candidate resumes against the job description.

Creating or syncing `JobSkill` rows from parsed JD data should be handled as a separate backend task.

## API Endpoints

The current backend supports CRUD and parsing APIs for job descriptions.

```text
POST   /api/job-descriptions
GET    /api/job-descriptions
GET    /api/job-descriptions/:id
PATCH  /api/job-descriptions/:id
DELETE /api/job-descriptions/:id
POST   /api/job-descriptions/:id/parse
GET    /api/job-descriptions/:id/parsed-data
```

## Delete Behavior

Delete is implemented as a soft delete.

The record is not physically removed from the database. Instead, the backend updates:

```text
isActive = false
```

Active list, detail, parse, and parsed-data queries should only work with records where:

```text
isActive = true
```

This keeps historical data available for future audit, application, or evaluation use cases.

## Current Limitations

The current implementation does not yet support:

- uploading JD files
- parsing JD files from PDF or DOCX
- automatic AI parsing during create/update
- automatic `JobSkill` generation from parsed JD data
- version history for edited job descriptions
- archiving with reason or metadata
- ownership or permission enforcement beyond `createdById`
- successful JD parsing until the AI Service `/parse/job-description` endpoint is available

These limitations should be revisited when the application flow becomes more complete.

## Design Notes

A job description should be treated as the source of truth for one hiring position.

Applications and evaluations should reference a specific `JobDescription` record. This keeps candidate scoring tied to the exact JD used at the time of evaluation.

If JD content changes significantly after candidates have already been evaluated, the product should later decide whether to:

- keep old evaluations as historical results
- re-run evaluations against the updated JD
- create a new JD version
- or clone the JD into a new posting

This behavior is not implemented yet.

## Postman Happy Path for CRUD

Recommended manual CRUD test flow:

```text
1. POST /api/job-descriptions
2. Copy data.id from the response
3. GET /api/job-descriptions
4. GET /api/job-descriptions/:id
5. PATCH /api/job-descriptions/:id
6. DELETE /api/job-descriptions/:id
7. GET /api/job-descriptions/:id again to confirm it is no longer active
```

After deletion, fetching the same ID should return `404 Job description not found` because active queries only return `isActive = true` records.

## Postman Test Flow for Parsing Before AI Service Support

Until the AI Service supports JD parsing, use this flow to test backend status handling:

```text
1. POST /api/job-descriptions
2. Copy data.id from the response
3. GET /api/job-descriptions/:id/parsed-data
   Expected: parseStatus = PENDING
4. POST /api/job-descriptions/:id/parse
   Expected: request fails because AI Service JD parsing is not ready
5. GET /api/job-descriptions/:id/parsed-data
   Expected: parseStatus = FAILED and parsingError is populated
```

## Postman Test Flow After AI Service Support

After the AI Service implements `POST /parse/job-description`, the expected successful parsing flow is:

```text
1. POST /api/job-descriptions
2. Copy data.id from the response
3. POST /api/job-descriptions/:id/parse
   Expected: parseStatus = SUCCESS, parsedData is populated, parsingError = null
4. GET /api/job-descriptions/:id/parsed-data
   Expected: parsedData returns the latest structured JD data
```
