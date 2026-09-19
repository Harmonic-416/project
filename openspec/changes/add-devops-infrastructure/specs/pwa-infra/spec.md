# Spec Delta

## Purpose

The installable PWA runtime shell: manifest, service worker, installability, and offline caching of already-visited practice content.

## ADDED Requirements

### Requirement: Installable PWA Shell

The system SHALL ship a web app manifest and a registered service worker so a supporting browser can install Harmonic to the home screen and launch it standalone. (Enables the PWA delivery model; prerequisite for N4.)

#### Scenario: Browser offers installation

- **WHEN** a user loads Harmonic over HTTPS in a PWA-capable browser and installability criteria are met (manifest with name, icons, start URL, display mode, and an active service worker)
- **THEN** the browser exposes an install affordance
- **AND** the installed app launches standalone using the manifest's start URL, name, icon, and theme

#### Scenario: Service worker registers on load

- **WHEN** the app loads in a browser that supports service workers
- **THEN** the service worker registers and reaches an active/controlling state
- **AND** where service workers are unsupported, the app stays fully usable with no unhandled error

### Requirement: Offline App Shell (N4)

The system SHALL precache the app shell (HTML, JS, CSS, manifest, icons) at service-worker install so the app boots offline after its first successful online load. (Supports N4.)

#### Scenario: App opens offline after a prior visit

- **WHEN** a user who has loaded the app online at least once reopens it with no network
- **THEN** the precached shell renders the UI without a network round-trip

#### Scenario: Deploy supersedes the cached shell

- **WHEN** a new version is deployed and the user reopens the app
- **THEN** the updated service worker and revisioned precache replace the stale shell on activation
- **AND** the user is not left pinned to the old cached version

### Requirement: Offline Practice Content Caching (N4)

The system SHALL cache practice content assets (notation/song files such as MusicXML and reference audio) after they are fetched online so a previously-visited lesson opens and renders offline, and SHALL bound the cache by maximum entry count and maximum age. (Implements N4.)

#### Scenario: Previously-viewed lesson works offline

- **WHEN** a user who opened a specific lesson online (fetching its assets) reopens that lesson with no network
- **THEN** the notation renders and the reference-audio asset is served from cache with no network request

#### Scenario: Never-visited content offline

- **WHEN** an offline user opens a lesson they never visited online
- **THEN** the app does not crash and surfaces that the content is unavailable offline rather than hanging or showing a broken view

#### Scenario: Cache stays bounded

- **WHEN** cached practice assets exceed the configured count or age limits
- **THEN** the oldest/expired entries are evicted so the cache does not grow without bound
