# API Contract Plan

## 1. Purpose

This document defines the shared API contract for **AI Recruiter Mini Backend**. Its purpose is to ensure that backend and frontend follow the same rules from the beginning of the project.

This contract standardizes:

- endpoint naming
- success response format
- error response format
- pagination structure
- path and query parameter usage
- file upload response shape
- date/time formatting
- ID naming
- enum and status conventions

This contract is intended to reduce ambiguity, improve maintainability, and make frontend-backend integration more predictable.

---

## 2. Base API Rules

### 2.1 Base Prefix

All API endpoints must use the following global prefix:

```
/api
```

Example:

```
/api/candidates
/api/resumes
/api/job-descriptions
/api/applications
/api/evaluations
/api/files
```

### 2.2 Data Format

All request and response bodies must use JSON, except for file upload endpoints which use `multipart/form-data`.

### 2.3 API Style

This project follows a REST-style API design with resource-oriented naming and standard HTTP methods.

---

## 3. Resource Naming Convention

### 3.1 Use Plural Resource Names

All top-level resources must use plural nouns.

Correct examples:

```
/candidates
/resumes
/job-descriptions
/applications
/evaluations
/files
```

Incorrect examples:

```
/candidate
/resume-item
/jd
/cv
/screening
```

### 3.2 Use Kebab-Case in URLs

Multi-word resources must use kebab-case.

Correct:

```
/job-descriptions
```

Incorrect:

```
/jobDescriptions
/job_descriptions
```

### 3.3 Domain Naming Rules

The project must preserve the following domain meanings:

- `Candidate` = a real applicant / person
- `Resume` = an uploaded CV file belonging to a candidate
- `JobDescription` = one job posting / JD
- `Application` = a candidate applying to a job using a specific resume
- `Evaluation` = one scoring run for one application

These concepts must not be merged or renamed inconsistently in APIs.

---

## 4. HTTP Method Rules

The API must use standard HTTP methods consistently.

### 4.1 GET

Used for retrieving data.

Examples:

```
GET /api/candidates
GET /api/candidates/:id
GET /api/evaluations/:id
```

### 4.2 POST

Used for creating a new resource or triggering a domain action.

Examples:

```
POST /api/candidates
POST /api/job-descriptions
POST /api/files/upload
POST /api/evaluations
```

### 4.3 PATCH

Used for partial updates.

Examples:

```
PATCH /api/candidates/:id
PATCH /api/job-descriptions/:id
PATCH /api/applications/:id/status
```

### 4.4 DELETE

Used for deleting a resource when deletion is allowed.

Examples:

```
DELETE /api/resumes/:id
DELETE /api/files/:id
```

### 4.5 PUT

Should only be used for full replacement updates. In the current MVP stage, PATCH is preferred for most update cases.

---

## 5. Success Response Format

All successful responses must follow a consistent structure.

### 5.1 Standard Success Response

```json
{
  "success": true,
  "message": "Success",
  "data": {}
}
```

> **Note:** The `meta` field is **omitted** in non-paginated responses. It only appears when the endpoint returns paginated data. Frontend must not assume `meta` is always present — check for its existence before using it.

### 5.2 Field Meanings

- `success`: always `true` for successful responses
- `message`: short readable message — for display only, not for logic
- `data`: main returned data
- `meta`: only present for paginated responses (see Section 7)

### 5.3 Single Resource Example

```json
{
  "success": true,
  "message": "Candidate fetched successfully",
  "data": {
    "id": "cand_123",
    "fullName": "Nguyen Van A",
    "email": "vana@example.com"
  }
}
```

### 5.4 List Response Example

A list response returns `data` as an array without a `meta` field. **A list response does not imply a paginated response.** Some endpoints return an array of items without pagination — for example, a fixed set of skills belonging to a job description. The absence of `meta` means the response is complete and not paginated.

```json
{
  "success": true,
  "message": "Candidates fetched successfully",
  "data": [
    {
      "id": "cand_123",
      "fullName": "Nguyen Van A"
    },
    {
      "id": "cand_124",
      "fullName": "Tran Thi B"
    }
  ]
}
```

### 5.5 Paginated Response Example

```json
{
  "success": true,
  "message": "Candidates fetched successfully",
  "data": [
    {
      "id": "cand_123",
      "fullName": "Nguyen Van A"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

### 5.6 Notes

- Controllers and services should return business data normally.
- The global `TransformResponseInterceptor` is responsible for wrapping successful responses into this format.
- Avoid manually wrapping responses in every controller unless a special case requires it.
- The interceptor detects if the returned object already has a `success` field — in that case it passes through without wrapping.

---

## 6. Error Response Format

All error responses must follow a consistent structure.

### 6.1 Standard Error Response

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [],
  "timestamp": "2026-04-21T12:00:00.000Z",
  "path": "/api/candidates"
}
```

### 6.2 Field Meanings

- `success`: always `false` for error responses
- `statusCode`: HTTP status code
- `message`: main error message
- `errors`: array of detailed error items — always an array, never `null`
- `timestamp`: ISO 8601 timestamp
- `path`: request path

### 6.3 Errors Field Convention

The `errors` field is **always an array**.

- Use `[]` when there are no detailed error items (e.g. not found, internal server error, business error without field details)
- Use an array of objects when detailed validation or business errors exist

Each item in `errors` has the following shape and is a **stable contract** — frontend can rely on these exact field names and types to write interfaces or types:

```typescript
{
  field: string | null;  // null when the error is not tied to a specific field
  message: string;       // always a non-empty string
}
```

Frontend TypeScript interface:

```typescript
interface ErrorItem {
  field: string | null;
  message: string;
}
```

> **Note on `field`:** Currently, validation errors from `ValidationPipe` map `field` to `null` because NestJS default error messages do not include the property name separately. This may be improved in a future iteration. Frontend should treat `field` as optional context — do not rely on it being populated.

### 6.4 Validation Error Example

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": null,
      "message": "email must be an email"
    },
    {
      "field": null,
      "message": "fullName should not be empty"
    }
  ],
  "timestamp": "2026-04-21T12:00:00.000Z",
  "path": "/api/candidates"
}
```

### 6.5 Not Found Example

```json
{
  "success": false,
  "statusCode": 404,
  "message": "Candidate not found",
  "errors": [],
  "timestamp": "2026-04-21T12:00:00.000Z",
  "path": "/api/candidates/cand_123"
}
```

### 6.6 Internal Server Error Example

```json
{
  "success": false,
  "statusCode": 500,
  "message": "Internal server error",
  "errors": [],
  "timestamp": "2026-04-21T12:00:00.000Z",
  "path": "/api/evaluations"
}
```

### 6.7 Runtime Error Logging

Unhandled runtime errors such as `TypeError`, `ReferenceError`, and unexpected exceptions must be logged before returning a `500` response.

The global `HttpExceptionFilter` is responsible for:

- normalizing the error response
- logging unhandled exceptions using NestJS `Logger`
- preserving the external API contract

In production, this logging layer can later be extended with tools such as Sentry or DataDog.

---

## 7. Pagination Contract

All paginated list endpoints must follow the same pagination rules.

### 7.1 Query Parameters

Supported pagination query parameters:

- `page`
- `limit`

Example:

```
GET /api/candidates?page=1&limit=10
```

### 7.2 Pagination Rules

- `page` starts from `1`
- `limit` must be a positive integer
- a default `limit` should be applied when not provided
- `totalPages` must be calculated as: `Math.ceil(total / limit)`

### 7.3 Paginated Response Format

```json
{
  "success": true,
  "message": "Candidates fetched successfully",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

### 7.4 Additional Query Parameters

List endpoints may also support:

- `search`
- `sortBy`
- `sortOrder`
- domain-specific filters such as `status`

Example:

```
GET /api/applications?page=1&limit=10&status=SCREENING&search=frontend
```

---

## 8. Path and Query Parameter Rules

### 8.1 Path Parameters

Use path parameters for identifying a specific resource.

Examples:

```
GET /api/candidates/:id
GET /api/resumes/:id
PATCH /api/job-descriptions/:id
DELETE /api/files/:id
```

### 8.2 Query Parameters

Use query parameters for:

- pagination
- filtering
- searching
- sorting

Examples:

```
GET /api/candidates?page=1&limit=10
GET /api/applications?status=SCREENING
GET /api/job-descriptions?search=backend
```

### 8.3 Rule

Do not use query parameters for mutations or actions that should be represented as resource or command endpoints.

---

## 9. File Upload Contract

The file module must expose a consistent upload response format.

### 9.1 Upload Endpoint Example

```
POST /api/files/upload
```

### 9.2 Request Type

File upload requests must use:

```
multipart/form-data
```

### 9.3 Upload Response Example

```json
{
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "id": "file_123",
    "fileName": "cv-nguyen-van-a.pdf",
    "mimeType": "application/pdf",
    "size": 123456,
    "url": "https://example.com/files/cv-nguyen-van-a.pdf",
    "storageKey": "resumes/cv-nguyen-van-a.pdf"
  }
}
```

### 9.4 File Response Rules

Uploaded file metadata should use consistent field names:

- `id`
- `fileName`
- `mimeType`
- `size`
- `url`
- `storageKey`

If a file is linked to another domain entity, that relation should be represented by explicit fields such as:

- `candidateId`
- `resumeId`

### 9.5 File Upload Error Cases

Common error responses for file upload:

**File too large (413):**

```json
{
  "success": false,
  "statusCode": 413,
  "message": "File size exceeds the allowed limit",
  "errors": [],
  "timestamp": "2026-04-21T12:00:00.000Z",
  "path": "/api/files/upload"
}
```

**Invalid file type (422):**

```json
{
  "success": false,
  "statusCode": 422,
  "message": "File type is not supported. Only PDF and DOCX are allowed",
  "errors": [],
  "timestamp": "2026-04-21T12:00:00.000Z",
  "path": "/api/files/upload"
}
```

---

## 10. Date and Time Convention

All datetime values returned by the API must use ISO 8601 string format.

Example:

```
2026-04-21T12:00:00.000Z
```

### 10.1 Rules

- all timestamps in responses must be serialized as strings
- use UTC consistently where possible
- do not return locale-specific formatted date strings

Incorrect examples:

```
21/04/2026 19:00
Apr 21, 2026
```

Correct example:

```
2026-04-21T12:00:00.000Z
```

---

## 11. ID Naming Convention

IDs must follow consistent naming rules across the entire API.

### 11.1 Primary ID Field

Every resource must use:

```
id
```

as the main identifier field in responses.

### 11.2 Foreign Key Naming

Related entity identifiers must use explicit camelCase names:

- `candidateId`
- `resumeId`
- `jobDescriptionId`
- `applicationId`
- `evaluationId`
- `fileId`

### 11.3 Rules

- do not use ambiguous names like `candidate_id` in API JSON
- do not use inconsistent naming like `jdId` when the domain name is `jobDescriptionId`

---

## 12. Enum and Status Convention

All enums and statuses returned by the API must use uppercase snake case (SCREAMING_SNAKE_CASE).

### 12.1 ApplicationStatus Values

```
DRAFT
APPLIED
SCREENING
SHORTLISTED
INTERVIEWING
OFFER
HIRED
REJECTED
WITHDRAWN
```

### 12.2 Other Enum Values

```
// ParseStatus
PENDING | PROCESSING | SUCCESS | FAILED

// EvaluationStatus
PENDING | PROCESSING | COMPLETED | FAILED

// JobSkillType
REQUIRED | PREFERRED

// SkillMatchType
MATCHED | MISSING | RELATED
```

### 12.3 Rules

- API responses must expose enum values in SCREAMING_SNAKE_CASE
- frontend is responsible for mapping enum values to user-friendly labels
- backend should not return mixed presentation labels such as `"Under Review"` as the source-of-truth enum
- **Enum values documented here must match the backend schema and runtime implementation exactly.** If the schema changes an enum value, this document must be updated at the same time. Discrepancies between this document and the schema are considered a contract violation.

---

## 13. Validation and Business Error Convention

### 13.1 Validation Errors

Validation errors come from `ValidationPipe` and follow the shared error format.

The `errors` array will contain one item per failed constraint. The `field` property is currently `null` for all validation errors — this may be improved in a future iteration.

Example:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": null,
      "message": "email must be an email"
    }
  ],
  "timestamp": "2026-04-21T12:00:00.000Z",
  "path": "/api/candidates"
}
```

### 13.2 Business Errors

Business logic errors must be thrown using `AppException` to preserve the shared error contract.

`AppException` accepts an optional `errors` array. When `null` is passed or no errors are provided, the filter normalizes the response to use `errors: []`.

Example cases:

- candidate already exists
- resume does not belong to candidate
- job description is inactive
- evaluation cannot run because parsed data is missing

Example response:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Resume does not belong to the given candidate",
  "errors": [],
  "timestamp": "2026-04-21T12:00:00.000Z",
  "path": "/api/applications"
}
```

### 13.3 Not Found Errors

When a resource cannot be found, return a `404` error using the same format.

Example:

```json
{
  "success": false,
  "statusCode": 404,
  "message": "Job description not found",
  "errors": [],
  "timestamp": "2026-04-21T12:00:00.000Z",
  "path": "/api/job-descriptions/jd_123"
}
```

---

## 14. Swagger and Documentation Alignment

Swagger documentation must reflect this contract as closely as possible.

### 14.1 Expectations

Swagger should document:

- endpoint paths
- HTTP methods
- DTO request shapes
- query parameters
- path parameters
- main success responses
- main error responses

### 14.2 Rule

As the project grows, any significant API shape change must update both:

- runtime implementation
- this contract document

---

## 15. Runtime Enforcement

This contract is not only documentation. It is also enforced by shared runtime components.

### 15.1 Implementation Files

```
src/common/interceptors/transform-response.interceptor.ts
src/common/filters/http-exception.filter.ts
src/common/exceptions/app.exception.ts
src/main.ts
```

### 15.2 Responsibilities

**TransformResponseInterceptor**

Wraps successful responses into the shared success format. Skips wrapping if the returned object already contains a `success` field.

**HttpExceptionFilter**

Normalizes validation errors, HTTP exceptions, business exceptions, and runtime exceptions into the shared error format. Always returns `errors` as an array — never `null`. Logs unhandled runtime exceptions using NestJS `Logger`.

**AppException**

Represents custom business errors. Accepts an optional `errors` array (defaults to `null` internally — normalized to `[]` by the filter before the response is sent).

**main.ts**

Registers the global interceptor, global exception filter, and validation pipe.

---

## 16. Frontend Integration Notes

Frontend consumers should assume:

- every successful response contains `success`, `message`, and `data`
- `meta` is only present when the response is paginated — always check before using
- every error response contains `success`, `statusCode`, `message`, `errors`, `timestamp`, and `path`
- `errors` is always an array — never `null`
- `errors[].field` may be `null` — treat it as optional context, not guaranteed
- enum/status values are source-of-truth constants, not display labels
- datetime values are ISO strings
- `message` is for display only — do not use it for conditional logic

---

## 17. Future Extensions

This contract may later be extended to cover:

- authentication and authorization contract
- bearer token format
- refresh token flow
- cursor-based pagination (note: changing from offset to cursor pagination is a **breaking change** to the `meta` shape — requires API versioning)
- bulk operation responses
- async job / webhook callback responses
- versioned APIs
- `field` population in validation errors via custom `exceptionFactory` in `ValidationPipe`

---

## 18. Summary

This API contract establishes a shared foundation for the entire project.

It ensures that:

- all endpoints follow consistent naming
- all successful responses share one structure
- all error responses share one structure
- pagination is predictable and `meta` only appears when relevant
- dates, IDs, enums, and uploads are standardized
- backend and frontend can integrate with fewer assumptions and less rework

This document should be treated as a living reference and updated whenever the API contract evolves.