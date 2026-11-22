## Purpose

Let guitarists increase practice tempo using the existing loop and single transport clock.

## ADDED Requirements

### Requirement: Optional speed trainer for guitar practice loops (F37)

Guitar Songs SHALL offer a speed trainer in Trouble spots mode when an active loop contains at least one scoreable note. The trainer SHALL start off and, when enabled, SHALL use the currently chosen tempo. After three consecutive clean repeats at the same tempo, it SHALL increase the effective tempo by five percentage points, capped at 100%, at the first available repeat boundary after scoring settles. It SHALL start a new streak at the increased tempo. The interface SHALL show the current tempo and streak progress, or indicate that the maximum tempo has been reached.

#### Scenario: The player earns a higher tempo

- **WHEN** the player enables the trainer at 60% and completes three consecutive clean repeats
- **THEN** the tempo increases to 65% at the next available repeat start, with the existing transport clock driving playback and scoring
- **AND** the trainer starts counting clean repeats at 65%

#### Scenario: The trainer reaches full tempo

- **WHEN** a qualifying streak is completed at 95%
- **THEN** the trainer increases to 100% and indicates that it has reached the maximum
- **AND** playback can continue looping at 100%

### Requirement: Manual tempo and loop control during speed training (F37)

Automatic tempo increases SHALL be temporary and SHALL leave the saved per-song tempo preference intact. Disabling the trainer, stopping practice, clearing or changing the loop, or leaving Trouble spots mode SHALL end the trainer and restore the chosen tempo. A manual tempo adjustment SHALL end the trainer and apply the new tempo through the existing preference control. Pausing or seeking SHALL reset the streak and discard the interrupted repeat.

#### Scenario: The player overrides the trainer

- **WHEN** the trainer reaches 75% from a chosen tempo of 60% and the player manually selects 65%
- **THEN** speed training ends and the existing tempo control applies and saves 65%

#### Scenario: Training ends without a manual change

- **WHEN** the player stops the loop after an automatic increase from 60% to 65%
- **THEN** speed training ends and the effective tempo returns to 60%
