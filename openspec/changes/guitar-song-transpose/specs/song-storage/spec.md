## Purpose

Retain the pitch setup of a guitar attempt when the recording is opened for review.

## ADDED Requirements

### Requirement: Saved guitar attempt retains its semitone shift (F23)

A saved guitar attempt SHALL retain the shift used during the run alongside the existing song identity. Opening a shared attempt SHALL restore its shift for the displayed score and play the existing recording at its recorded pitch. An older attempt without shift metadata SHALL open As written.

#### Scenario: Review a shared take recorded a semitone down

- **WHEN** a reviewer opens a shared attempt saved at −1
- **THEN** the displayed notation and tuning match the take while the existing recording plays at its recorded pitch
