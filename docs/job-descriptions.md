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

## Future Parsing Flow

A future version may parse `rawText` by calling the AI Service.

Expected future flow:

```text
Recruiter creates or updates a JD
-> Backend stores rawText
-> Backend sends rawText to AI Service
-> AI Service returns structured JD data
-> Backend stores parsedData
-> Backend creates or updates JobSkill rows
```

The `parsedData` field is intended to store structured data extracted from the JD, such as:

- responsibilities
- requirements
- nice-to-have qualifications
- minimum experience years
- education requirement
- domain keywords

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

## API Endpoints

The current backend supports CRUD APIs for job descriptions.

```text
POST   /api/job-descriptions
GET    /api/job-descriptions
GET    /api/job-descriptions/:id
PATCH  /api/job-descriptions/:id
DELETE /api/job-descriptions/:id
```

## Delete Behavior

Delete is implemented as a soft delete.

The record is not physically removed from the database. Instead, the backend updates:

```text
isActive = false
```

Active list and detail queries should only return records where:

```text
isActive = true
```

This keeps historical data available for future audit, application, or evaluation use cases.

## Current Limitations

The current implementation does not yet support:

- uploading JD files
- parsing JD files from PDF or DOCX
- automatic AI parsing during create/update
- automatic `JobSkill` generation
- version history for edited job descriptions
- archiving with reason or metadata
- ownership or permission enforcement beyond `createdById`

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

## Postman Happy Path

Recommended manual test flow:

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
