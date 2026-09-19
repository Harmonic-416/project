# Deployment

## Purpose

The delivery substrate every other Harmonic capability ships on: the Vite production build, Supabase environment/secret configuration, and static HTTPS hosting with build-on-push CI.

## Requirements

### Requirement: Reproducible Production Build

The system SHALL provide a single build command that emits an optimized static bundle including the PWA manifest and service worker, and SHALL fail with a non-zero exit rather than emit a broken artifact.

#### Scenario: Build produces a deployable artifact

- **WHEN** the build command runs on a clean checkout with dependencies installed
- **THEN** it emits a static output directory with the app entry HTML, hashed JS/CSS, the web app manifest, and the generated service worker
- **AND** the command exits zero

#### Scenario: Build fails loudly

- **WHEN** the build hits a compile error or missing required configuration
- **THEN** the command exits non-zero and reports the failure
- **AND** no partial or stale artifact is published as a success

### Requirement: Supabase Environment Configuration

The system SHALL source the Supabase project URL and anon (public) key from build-time environment variables, SHALL NOT commit any real credential or service-role/secret key, and SHALL provide a committed example file documenting the required variables. (Enables backend capabilities: F1 and all server-backed features.)

#### Scenario: App builds against configured backend

- **WHEN** the required Supabase variables (project URL and anon key) are present at build time
- **THEN** the built app connects to that Supabase project at runtime

#### Scenario: Missing configuration is caught

- **WHEN** a required Supabase variable is absent at build or startup
- **THEN** the failure is surfaced explicitly rather than silently connecting to a wrong or empty backend

#### Scenario: No secrets in the repository

- **WHEN** the source repository is inspected
- **THEN** it contains an example env file listing the required variable names with no real values
- **AND** it contains no real Supabase credentials and no service-role/secret key, and actual `.env` files are ignored by version control

### Requirement: HTTPS Static Hosting

The system SHALL be served as static files over HTTPS at a reachable URL, since service-worker registration and microphone access both require a secure context. (Prerequisite for the PWA shell and N2 phone validation.)

#### Scenario: App reachable over HTTPS

- **WHEN** a user navigates to the deployed URL
- **THEN** the app loads over HTTPS and the service worker is permitted to register
- **AND** microphone-dependent features can request mic access under the secure context

### Requirement: Build-on-Push CI

The system SHALL run the production build automatically on push to the main branch so a build-breaking change is caught before release, and only a passing build SHALL be published.

#### Scenario: CI blocks a broken build

- **WHEN** a commit that breaks the build is pushed to the main branch
- **THEN** CI runs the build, it fails, and the failure is reported
- **AND** the broken commit is not published as the live deployment

#### Scenario: CI publishes a passing build

- **WHEN** a commit that builds successfully is pushed to the main branch
- **THEN** CI produces the static artifact and deploys it as the live version
