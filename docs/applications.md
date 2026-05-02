# Applications Flow

**Project:** AI Recruiter Mini — Backend  
**Scope:** Application domain flow linking Candidate, Resume, and JobDescription.

---

## 1. Purpose

The `Application` domain connects one candidate, one resume, and one job description into a trackable hiring application.

An application answers this question:

> Which candidate applied to which job using which resume?

This flow is handled by `ApplicationsModule`.

---

## 2. Domain Models

### Application

`Application` represents a candidate applying to a specific job description using a specific resume.

Key fields:

| Field | Purpose |
|---|---|
| `candidateId` | Candidate linked to the application |
| `jobDescriptionId` | Job description being applied to |
| `resumeId` | Resume used for this application |
| `createdById` | Optional user who created the application |
| `status` | Current application lifecycle status |
| `source` | Optional source, such as LinkedIn, Referral, Job Board |
| `appliedAt` | When the application was created/applied |
| `lastActivityAt` | Last important activity timestamp |
| `notes` | Internal notes |

Important rule:

> `resumeId` must belong to `candidateId`. This is enforced in the application layer.

### ApplicationEvent

`ApplicationEvent` is the audit log for application lifecycle changes.

Key fields:

| Field | Purpose |
|---|---|
| `applicationId` | Related application |
| `eventType` | Type of lifecycle event |
| `eventData` | JSON payload for event-specific metadata |
| `createdAt` | Event timestamp |

Current event types:

| Event Type | When it is created |
|---|---|
| `APPLICATION_CREATED` | When a new application is created |
| `STATUS_CHANGED` | When application status changes |

---

## 3. Application Status

Valid statuses:

```txt
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

Default status:

```txt
APPLIED
```

---

## 4. Module Structure

```txt
src/modules/applications/
├── applications.controller.ts
├── applications.module.ts
├── applications.service.ts
└── dto/
    ├── application-query.dto.ts
    ├── create-application.dto.ts
    ├── update-application.dto.ts
    └── update-application-status.dto.ts
```

Shared enum:

```txt
src/common/enums/application-status.enum.ts
```

Registered in:

```txt
src/app.module.ts
```

---

## 5. Validation Rules

### Create Application

When creating an application, the service validates:

1. Candidate exists
2. Resume exists
3. Resume belongs to candidate
4. Job description exists
5. Job description is active
6. `createdById` exists when provided

If any validation fails, the service throws `AppException`.

Common errors:

| Scenario | Message | Status Code |
|---|---|---|
| Candidate does not exist | `Candidate not found` | 404 |
| Resume does not exist | `Resume not found` | 404 |
| Resume belongs to another candidate | `Resume does not belong to candidate` | 409 |
| Job description does not exist | `Job description not found` | 404 |
| Job description is inactive | `Job description is not active` | 409 |
| Created-by user does not exist | `Created by user not found` | 404 |

---

## 6. Transaction Rules

Transactions are used when multiple database writes must succeed or fail together.

### Create Application Transaction

Creating an application also creates an initial audit event.

```txt
Create Application
  ↓
Create ApplicationEvent: APPLICATION_CREATED
```

If event creation fails, the application should not be persisted without its audit record.

### Update Status Transaction

Changing status also creates a status event.

```txt
Update Application.status
  ↓
Update Application.lastActivityAt
  ↓
Create ApplicationEvent: STATUS_CHANGED
```

If event creation fails, the status update should not be persisted alone.

---

## 7. Endpoints

All routes are prefixed with `/api`.

---

### 7.1 Create Application

```http
POST /api/applications
```

Request body:

```json
{
  "candidateId": "candidate_id",
  "resumeId": "resume_id",
  "jobDescriptionId": "job_description_id",
  "source": "LinkedIn",
  "notes": "Candidate applied from LinkedIn"
}
```

Optional fields:

```json
{
  "createdById": "user_id",
  "source": "Referral",
  "notes": "Internal note"
}
```

Successful response:

```json
{
  "success": true,
  "message": "Application created successfully",
  "data": {
    "id": "application_id",
    "candidateId": "candidate_id",
    "resumeId": "resume_id",
    "jobDescriptionId": "job_description_id",
    "status": "APPLIED",
    "source": "LinkedIn",
    "notes": "Candidate applied from LinkedIn"
  }
}
```

Side effect:

```txt
ApplicationEvent APPLICATION_CREATED is created.
```

---

### 7.2 List Applications

```http
GET /api/applications
```

Query parameters:

| Parameter | Type | Default | Purpose |
|---|---:|---:|---|
| `page` | number | `1` | Page number |
| `limit` | number | `10` | Page size, max 100 |
| `candidateId` | string | — | Filter by candidate |
| `jobDescriptionId` | string | — | Filter by job description |
| `resumeId` | string | — | Filter by resume |
| `status` | ApplicationStatus | — | Filter by status |
| `sortBy` | string | `createdAt` | `createdAt`, `updatedAt`, `appliedAt`, `lastActivityAt` |
| `sortOrder` | string | `desc` | `asc` or `desc` |

Example:

```http
GET /api/applications?page=1&limit=10&status=APPLIED
```

Successful response:

```json
{
  "success": true,
  "message": "Applications fetched successfully",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "totalPages": 0
  }
}
```

---

### 7.3 Get Application Detail

```http
GET /api/applications/:id
```

Purpose:

Use this endpoint when the client needs full application detail.

Successful response:

```json
{
  "success": true,
  "message": "Application fetched successfully",
  "data": {
    "id": "application_id",
    "candidate": {},
    "resume": {},
    "jobDescription": {},
    "_count": {
      "evaluations": 0,
      "events": 0
    }
  }
}
```

---

### 7.4 Update Application

```http
PATCH /api/applications/:id
```

Purpose:

Update lightweight editable fields only.

Request body:

```json
{
  "source": "Referral",
  "notes": "Candidate referred by internal recruiter"
}
```

Successful response:

```json
{
  "success": true,
  "message": "Application updated successfully",
  "data": {
    "id": "application_id",
    "source": "Referral",
    "notes": "Candidate referred by internal recruiter"
  }
}
```

---

### 7.5 Update Application Status

```http
PATCH /api/applications/:id/status
```

Request body:

```json
{
  "status": "SCREENING",
  "note": "Moved to screening after initial review"
}
```

Successful response:

```json
{
  "success": true,
  "message": "Application status updated successfully",
  "data": {
    "id": "application_id",
    "status": "SCREENING"
  }
}
```

Side effect:

```txt
ApplicationEvent STATUS_CHANGED is created when the status changes.
```

Event payload example:

```json
{
  "fromStatus": "APPLIED",
  "toStatus": "SCREENING",
  "note": "Moved to screening after initial review"
}
```

If the requested status is the same as the current status, the existing application is returned and no duplicate status event is created.

---

### 7.6 Get Application Events

```http
GET /api/applications/:id/events
```

Purpose:

Return audit events for one application.

Successful response:

```json
{
  "success": true,
  "message": "Application events fetched successfully",
  "data": [
    {
      "id": "event_id",
      "applicationId": "application_id",
      "eventType": "STATUS_CHANGED",
      "eventData": {
        "fromStatus": "APPLIED",
        "toStatus": "SCREENING"
      },
      "createdAt": "2026-05-02T00:00:00.000Z"
    }
  ]
}
```

Events are ordered by `createdAt desc`.

---

### 7.7 Get Candidate Applications

```http
GET /api/candidates/:id/applications
```

Purpose:

Return a lightweight list of applications for a candidate profile page.

This endpoint intentionally does not return full application detail to avoid oversized payloads when a candidate has multiple applications.

Returned summary fields:

```json
{
  "id": "application_id",
  "candidateId": "candidate_id",
  "jobDescriptionId": "job_description_id",
  "resumeId": "resume_id",
  "status": "SCREENING",
  "source": "Referral",
  "appliedAt": "2026-05-02T00:00:00.000Z",
  "lastActivityAt": "2026-05-02T00:00:00.000Z",
  "notes": "Internal note",
  "resume": {
    "id": "resume_id",
    "parseStatus": "SUCCESS",
    "uploadedAt": "2026-05-02T00:00:00.000Z",
    "fileAsset": {
      "id": "file_asset_id",
      "fileName": "resume.pdf",
      "fileType": "PDF"
    }
  },
  "jobDescription": {
    "id": "job_description_id",
    "title": "Backend Developer",
    "companyName": "Example Company",
    "department": "Engineering",
    "location": "Remote",
    "employmentType": "Full-time",
    "seniority": "Mid-level",
    "isActive": true
  },
  "_count": {
    "evaluations": 0,
    "events": 2
  }
}
```

Use `GET /api/applications/:id` when full detail is needed.

---

## 8. Happy Case Test Order

Recommended Postman order:

```txt
1. POST /api/applications
2. GET /api/applications
3. GET /api/applications/:id
4. PATCH /api/applications/:id
5. PATCH /api/applications/:id/status
6. GET /api/applications/:id/events
7. GET /api/candidates/:id/applications
```

Required existing data:

```txt
candidateId: existing candidate id
resumeId: existing resume id belonging to candidateId
jobDescriptionId: existing active job description id
```

---

## 9. Payload Strategy

### Full Detail Endpoints

Use full detail payloads for:

```txt
GET /api/applications/:id
POST /api/applications
PATCH /api/applications/:id
PATCH /api/applications/:id/status
```

These endpoints are usually used after the client focuses on one application.

### Summary List Endpoints

Use lightweight payloads for:

```txt
GET /api/candidates/:id/applications
```

Reason:

- A candidate can have many applications
- Returning full resume/JD/skills/parsed data for each row makes the response too large
- Summary data is enough for candidate profile UI lists

---

## 10. Future Improvements

Potential improvements when the feature grows:

- Add pagination to `GET /api/candidates/:id/applications`
- Add filters by `status`, `jobDescriptionId`, and date range
- Add actor/user metadata to `ApplicationEvent`
- Add event types such as `NOTE_ADDED`, `EVALUATION_STARTED`, `EVALUATION_COMPLETED`
- Add status transition rules if the workflow becomes stricter
