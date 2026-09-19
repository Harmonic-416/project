# Auth

## Purpose
Supabase-backed registration, login, logout, and persisted sessions; the authenticated account anchors all per-user data (progress, scores, recordings). Covers F1.

## Requirements

### Requirement: User Registration (F1)
The system SHALL let a new user register with email and password via Supabase Auth, creating exactly one durable account identity that all per-user data is keyed to. (F1)

#### Scenario: Successful registration
- **WHEN** a visitor submits a valid, unused email and a policy-compliant password
- **THEN** a Supabase Auth account is created and the user is signed in
- **AND** that account is the owner (`user_id`) for future progress, score, and recording rows

#### Scenario: Duplicate email rejected
- **WHEN** a visitor submits an email that already has an account
- **THEN** registration fails with an "email already in use" error
- **AND** no duplicate account is created

#### Scenario: Invalid credentials rejected at registration
- **WHEN** a visitor submits a malformed email or a password below the minimum policy
- **THEN** registration is rejected with a validation error and no account is created

### Requirement: User Login (F1)
The system SHALL authenticate a returning user by email and password, establishing a session on success. (F1)

#### Scenario: Successful login
- **WHEN** a registered user submits their correct email and password
- **THEN** a session is established
- **AND** their stored progress, scores, and recordings become accessible

#### Scenario: Wrong password rejected
- **WHEN** a user submits a registered email with a wrong password
- **THEN** login fails with a generic invalid-credentials error and no session is created

### Requirement: Session Persistence and Logout (F1)
The system SHALL persist a session across app restarts until it expires or the user logs out, and SHALL clear it on logout so per-user data is no longer accessible from that device. (F1)

#### Scenario: Session survives app restart
- **WHEN** an authenticated user reopens the PWA before the session expires
- **THEN** they remain logged in without re-entering credentials
- **AND** their account-scoped data is available again

#### Scenario: Logout clears access
- **WHEN** an authenticated user logs out
- **THEN** the session is cleared
- **AND** further requests for their progress, scores, or recordings are denied until they log in again

### Requirement: Account Anchors Per-User Data (F1, N5)
The system SHALL scope every per-user record (progress, run-throughs/scores, tempo preferences, recordings) to the authenticated account so no user can read or write another's data. (F1, N5)

#### Scenario: Data isolation between accounts
- **WHEN** authenticated user A requests progress, run-through, or recording data
- **THEN** only rows owned by A are returned
- **AND** rows owned by any other user are never returned or modifiable

#### Scenario: Unauthenticated access denied
- **WHEN** per-user data is requested without a valid session
- **THEN** the request is denied and no per-user data is returned
