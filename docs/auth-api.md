# Auth API Documentation

## 1. Purpose

This document describes the current authentication and authorization flow for **AI Recruiter Mini Backend**.

The auth API was added after the backend resource APIs were implemented. It introduces:

- user accounts with password hashes
- login with email and password
- JWT access token generation
- Bearer token authentication
- role-based authorization through guards and decorators
- current-user ownership for created resources

This document should be used by the frontend when integrating protected backend APIs.

---

## 2. Current Auth Scope

### Implemented

- `POST /api/auth/login`
- `POST /api/users`
- `GET /api/users`
- `JwtAuthGuard`
- `RolesGuard`
- `@Roles(...)` decorator
- `@CurrentUser()` decorator
- password hashing and verification using `scrypt`
- JWT signing and verification using HMAC SHA-256 (`HS256`)
- protected access for candidates, resumes, files, job descriptions, applications, and evaluations

### Not implemented yet

- public user registration endpoint
- refresh token flow
- logout / token revocation
- password reset flow
- email verification
- profile self-service endpoint such as `/api/users/me`

---

## 3. Auth Concepts

### User

A `User` represents an internal backend user who can access the recruiter dashboard APIs.

Important fields:

| Field | Meaning |
| --- | --- |
| `id` | User identifier |
| `email` | Unique login email |
| `passwordHash` | Hashed password stored in database |
| `fullName` | Optional display name |
| `role` | Authorization role |
| `isActive` | Whether the user is allowed to login/use APIs |

The API must never return `passwordHash` to the frontend.

### Roles

Current roles are based on `UserRole` from Prisma:

| Role | Intended usage |
| --- | --- |
| `ADMIN` | Full management access, including user creation/listing |
| `RECRUITER` | Main operational user for creating and managing recruitment data |
| `HIRING_MANAGER` | Review-oriented access for viewing data and updating application status |

---

## 4. Login API

### Endpoint

```http
POST /api/auth/login
```

### Auth required

No.

This is the public login endpoint used to obtain an access token.

### Request body

```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

Validation rules:

| Field | Rule |
| --- | --- |
| `email` | Required, valid email, max 255 characters |
| `password` | Required string, 8-128 characters |

### Success response

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "<jwt>",
    "tokenType": "Bearer",
    "expiresIn": 86400,
    "user": {
      "id": "user_id",
      "email": "admin@example.com",
      "fullName": "Admin User",
      "role": "ADMIN"
    }
  }
}
```

### Error cases

| Case | Status | Message |
| --- | --- | --- |
| Email does not exist | `401` | `Invalid email or password` |
| Password is invalid | `401` | `Invalid email or password` |
| User is inactive | `401` | `Invalid email or password` |
| Missing/invalid request body | `400` | Validation error |

The login endpoint intentionally uses the same message for missing user and invalid password to avoid leaking account existence.

---

## 5. Bearer Token Usage

All protected endpoints must receive the token in the `Authorization` header.

```http
Authorization: Bearer <accessToken>
```

Frontend should store the returned token and attach it to every protected backend request.

### Missing token

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Authentication required",
  "errors": [],
  "timestamp": "2026-05-16T00:00:00.000Z",
  "path": "/api/candidates"
}
```

### Invalid or expired token

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Invalid or expired token",
  "errors": [],
  "timestamp": "2026-05-16T00:00:00.000Z",
  "path": "/api/candidates"
}
```

### Inactive user

```json
{
  "success": false,
  "statusCode": 401,
  "message": "User is inactive or no longer exists",
  "errors": [],
  "timestamp": "2026-05-16T00:00:00.000Z",
  "path": "/api/candidates"
}
```

---

## 6. JWT Behavior

The backend signs access tokens with:

- algorithm: `HS256`
- payload fields: `sub`, `email`, `role`, `iat`, `exp`
- secret from `JWT_SECRET`
- expiry from `JWT_EXPIRES_IN_SECONDS`, defaulting to `86400` seconds when not configured

Example decoded payload:

```json
{
  "sub": "user_id",
  "email": "admin@example.com",
  "role": "ADMIN",
  "iat": 1778880000,
  "exp": 1778966400
}
```

Frontend should not depend on token internals for business logic. Use the `user` object returned from login for UI state and let the backend enforce authorization.

---

## 7. Users API

The users API is protected and admin-only.

### Create user

```http
POST /api/users
Authorization: Bearer <admin_token>
```

Required role: `ADMIN`

Request body:

```json
{
  "email": "recruiter@example.com",
  "password": "password123",
  "fullName": "Recruiter User",
  "role": "RECRUITER"
}
```

Success response:

```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": "user_id",
    "email": "recruiter@example.com",
    "fullName": "Recruiter User",
    "role": "RECRUITER",
    "isActive": true,
    "createdAt": "2026-05-16T00:00:00.000Z",
    "updatedAt": "2026-05-16T00:00:00.000Z"
  }
}
```

Notes:

- Password is hashed before persistence.
- Returned user data excludes `passwordHash`.
- If `role` is omitted, it defaults to `RECRUITER`.

### List users

```http
GET /api/users?page=1&limit=10&search=admin&role=ADMIN&isActive=true
Authorization: Bearer <admin_token>
```

Required role: `ADMIN`

Supported query parameters:

| Query | Purpose |
| --- | --- |
| `page` | Page number |
| `limit` | Page size |
| `search` | Search by email or full name |
| `role` | Filter by user role |
| `isActive` | Filter active/inactive users |
| `sortBy` | Sort field |
| `sortOrder` | `asc` or `desc` |

---

## 8. Protected Resource APIs

Most domain APIs now require both authentication and role authorization.

### General rule

| Operation type | Typical roles |
| --- | --- |
| Create/update/delete operational data | `ADMIN`, `RECRUITER` |
| Read recruitment data | `ADMIN`, `RECRUITER`, `HIRING_MANAGER` |
| Update application status | `ADMIN`, `RECRUITER`, `HIRING_MANAGER` |
| Manage users | `ADMIN` only |

### Resource role matrix

| Resource | Endpoint examples | Allowed roles |
| --- | --- | --- |
| Auth | `POST /api/auth/login` | Public |
| Users | `POST /api/users`, `GET /api/users` | `ADMIN` |
| Candidates | create/update/delete | `ADMIN`, `RECRUITER` |
| Candidates | list/detail/resumes | `ADMIN`, `RECRUITER`, `HIRING_MANAGER` |
| Resumes | create/parse/update/delete | `ADMIN`, `RECRUITER` |
| Resumes | list/detail/parsed-data | `ADMIN`, `RECRUITER`, `HIRING_MANAGER` |
| Files | upload/delete | `ADMIN`, `RECRUITER` |
| Files | detail | `ADMIN`, `RECRUITER`, `HIRING_MANAGER` |
| Job descriptions | create/update/delete/parse | `ADMIN`, `RECRUITER` |
| Job descriptions | list/detail/skills/parsed-data | `ADMIN`, `RECRUITER`, `HIRING_MANAGER` |
| Applications | create/update | `ADMIN`, `RECRUITER` |
| Applications | list/detail/events/by-candidate | `ADMIN`, `RECRUITER`, `HIRING_MANAGER` |
| Applications | update status | `ADMIN`, `RECRUITER`, `HIRING_MANAGER` |
| Evaluations | create/retry | `ADMIN`, `RECRUITER` |
| Evaluations | list/detail/breakdown/skills/questions/evidence/by-application | `ADMIN`, `RECRUITER`, `HIRING_MANAGER` |

---

## 9. Current User Ownership

Some create flows now use the authenticated user from `@CurrentUser()` instead of trusting `createdById` from the request body.

Current behavior:

| Flow | Creator source |
| --- | --- |
| Create job description | `currentUser.id` |
| Create application | `currentUser.id` |
| Create evaluation | `currentUser.id` |
| Retry evaluation | `currentUser.id` |

Frontend should not send `createdById` for these flows. The backend derives it from the Bearer token.

---

## 10. Frontend Integration Notes

### Login flow

1. Call `POST /api/auth/login` with email and password.
2. Save `data.accessToken` and `data.user`.
3. Add `Authorization: Bearer <accessToken>` to protected API requests.
4. On `401`, clear auth state and redirect to login.
5. On `403`, show a forbidden/permission message instead of retrying login.

### API client behavior

Frontend API client should:

- centralize token injection in one request wrapper/interceptor
- not send `createdById` from forms
- read `user.role` only for UI visibility, not for security decisions
- handle both `401` and `403` consistently
- treat `message` as display text only
- rely on backend response `data` and optional `meta` shape from `docs/api-contract.md`

---

## 11. Environment Variables

Auth-related environment variables:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `JWT_SECRET` | Yes | None | Secret used to sign and verify access tokens |
| `JWT_EXPIRES_IN_SECONDS` | No | `86400` | Access token lifetime in seconds |

Recommended local example:

```env
JWT_SECRET="replace-with-a-long-random-secret"
JWT_EXPIRES_IN_SECONDS=86400
```

Security notes:

- Never commit real JWT secrets.
- Use a long random secret in production.
- Rotate secrets carefully because existing tokens become invalid after rotation.

---

## 12. Manual Test Checklist

### Admin bootstrap

Because public registration is not implemented yet, at least one admin user must exist before login testing.

Suggested options:

- create an admin through a local seed script
- insert an admin user manually with a valid `passwordHash`
- temporarily create a user in a controlled dev-only setup, then remove the temporary path

### Login

- [ ] Login with valid active user succeeds.
- [ ] Login with wrong password returns `401`.
- [ ] Login with inactive user returns `401`.
- [ ] Response includes `accessToken`, `tokenType`, `expiresIn`, and safe user data.

### Protected routes

- [ ] Missing token returns `401`.
- [ ] Invalid token returns `401`.
- [ ] Expired token returns `401`.
- [ ] Valid token allows matching role.
- [ ] Valid token with wrong role returns `403`.

### User management

- [ ] Admin can create users.
- [ ] Admin can list users.
- [ ] Recruiter cannot access `/api/users`.
- [ ] Hiring manager cannot access `/api/users`.

### Creator ownership

- [ ] Created job descriptions use `currentUser.id` as `createdById`.
- [ ] Created applications use `currentUser.id` as `createdById`.
- [ ] Created/retried evaluations use `currentUser.id` as `createdById`.

---

## 13. Future Improvements

- Add refresh token support.
- Add logout/token revocation.
- Add `/api/users/me` endpoint.
- Add password reset flow.
- Add initial admin seed command.
- Add request rate limiting for login.
- Move JWT environment validation into `env.validation.ts` if not already enforced there.
- Add e2e tests for role matrix.
