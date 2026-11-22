## Purpose

Keep personal backing recordings and their manual alignment local to the open guitar song.

## ADDED Requirements

### Requirement: Local backing track lifetime and privacy (F4, N5)

Guitar Songs SHALL keep imported backing audio and its alignment on the device for the open song. It SHALL exclude the backing file and its alignment from uploads, shared attempts, and account sync. Closing or changing the song SHALL release the imported audio and clear its alignment.

#### Scenario: The player changes songs after importing a recording

- **WHEN** the player opens a different Guitar Song after aligning a backing track
- **THEN** the new song opens without the previous backing audio or alignment
- **AND** no backing file or alignment is uploaded
