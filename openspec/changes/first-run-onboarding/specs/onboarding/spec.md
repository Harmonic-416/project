## Purpose
First-run guidance for Harmonic: a one-screen welcome that names the app's areas and lets the player pick an instrument, a reason given before the microphone is requested, one short tip per core surface shown the first time it is reached, a help control that replays any of it, and empty views that say how to fill them — all skippable, never blocking, and the same shape on both instruments.

## ADDED Requirements

### Requirement: One-screen welcome with instrument choice
On the first open of the app in a browser, the system SHALL show a single welcome screen that names Home, Guitar, Vocal and Social in one line each and offers **Guitar**, **Voice** and **Just look around**. Choosing Guitar SHALL open the Guitar Tuner; choosing Voice SHALL open the Vocal warm-up; Just look around SHALL open Home. The welcome SHALL be a single screen (no further steps), SHALL be dismissible at any time without choosing, and SHALL NOT be shown again automatically once chosen or dismissed. When the app is opened from a shared-run or invite link, the welcome SHALL NOT be shown on that open; it SHALL be shown on the next open that has no such link.

#### Scenario: First open shows the welcome
- **WHEN** a user opens the app for the first time in this browser, with no shared-run or invite link
- **THEN** the welcome screen is shown with the four areas and the three choices

#### Scenario: Choosing an instrument opens its setup step
- **WHEN** the user chooses Guitar on the welcome
- **THEN** the Guitar tab opens on the Tuner
- **WHEN** the user chooses Voice on the welcome
- **THEN** the Vocal tab opens on the warm-up

#### Scenario: The welcome can be left without choosing
- **WHEN** the user dismisses the welcome by its close control or the Escape key
- **THEN** the app shows Home
- **AND** the welcome is not shown on later opens

#### Scenario: A shared link is never interrupted
- **WHEN** a first-time user opens the app from a shared-run or invite link
- **THEN** the shared run or invite opens directly, with no welcome
- **AND** the welcome is shown on the next open without a link

### Requirement: Microphone priming before the first request
Before the first action in this browser that would request the microphone, on either instrument, the system SHALL show a short card stating what the microphone is used for and that live audio never leaves the device, with **Allow microphone** and **Not now**. Only Allow microphone SHALL proceed to the browser's permission request; Not now SHALL return the player to the screen without requesting it. When the browser reports the microphone as blocked, the card SHALL say how to allow it in the browser settings instead of offering Allow. Activities that do not listen SHALL NOT show the card.

#### Scenario: The reason comes before the browser prompt
- **WHEN** a player who has never granted the microphone presses a control that starts listening
- **THEN** the priming card is shown first
- **AND** the browser permission prompt appears only after Allow microphone is chosen

#### Scenario: Not now requests nothing
- **WHEN** the player chooses Not now on the priming card
- **THEN** no microphone permission is requested
- **AND** the player stays on the same screen with the control available to try again

#### Scenario: A blocked microphone gets directions, not silence
- **WHEN** the browser reports the microphone permission as denied
- **THEN** the card explains how to allow the microphone for this site
- **AND** it does not offer an Allow button that cannot work

#### Scenario: Activities that do not listen are not primed
- **WHEN** a player opens ear training or Listen mode
- **THEN** no priming card is shown

### Requirement: One-time feature tip per core surface
The system SHALL have exactly one tip for each core surface in the tip catalogue, stating in at most two sentences what the surface is for and the first thing to do there. A tip SHALL appear the first time the player reaches its surface, anchored to the control it describes, and SHALL NOT cover or disable any control. A tip SHALL close with **Got it**, its close control or the Escape key, and once closed SHALL NOT reappear automatically. At most one tip SHALL be visible at a time, and no tip SHALL appear while a run is counting in, playing or listening.

#### Scenario: A tip appears on the first visit only
- **WHEN** the player reaches a core surface for the first time
- **THEN** that surface's tip is shown next to the control it describes
- **WHEN** the player closes it and later returns to the surface
- **THEN** the tip is not shown again

#### Scenario: Tips never block the screen
- **WHEN** a tip is visible
- **THEN** every control on the screen remains usable, including the one the tip points at

#### Scenario: One tip at a time
- **WHEN** a screen contains more than one surface whose tip has not been seen
- **THEN** only one tip is shown, and the next is shown after it is closed

#### Scenario: No tips during a run
- **WHEN** a run is counting in, playing or listening
- **THEN** no tip opens
- **AND** a tip that was due waits until the run stops

### Requirement: Help control that replays guidance
The system SHALL show a help control ("?") in the practice header shared by Guitar and Vocal. Activating it SHALL show the current screen's tip (even if seen before) and SHALL offer **Replay welcome** and **Reset tips**. Reset tips SHALL mark every tip unseen. The help control SHALL never open anything on its own.

#### Scenario: Help shows the tip for this screen
- **WHEN** the player activates the help control on a core surface
- **THEN** that surface's tip is shown, whether or not it was seen before

#### Scenario: The welcome and tips can be replayed
- **WHEN** the player chooses Replay welcome
- **THEN** the welcome screen is shown
- **WHEN** the player chooses Reset tips
- **THEN** each core surface shows its tip again on the next visit

#### Scenario: Help is on both instruments in the same place
- **WHEN** the player opens the Guitar tab or the Vocal tab
- **THEN** the help control is in the same position in the header on both

### Requirement: Stuck indicator on the help control
When a player has been on a core practice surface for 30 seconds without taking that surface's main action (for example Play, Start or choosing a song), the system SHALL mark the help control with a visible indicator, and SHALL clear it when the main action is taken or the help control is used. The indicator SHALL NOT open a tip, move focus, play a sound or advance anything. It SHALL be announced once to assistive technology. Any pulse animation SHALL be removed when the user prefers reduced motion.

#### Scenario: Idling marks the help control
- **WHEN** the player stays on a practice surface for 30 seconds without taking its main action
- **THEN** the help control shows the stuck indicator
- **AND** no tip opens and nothing else changes on the screen

#### Scenario: Acting clears the indicator
- **WHEN** the player takes the surface's main action, or activates the help control
- **THEN** the indicator is removed

#### Scenario: Reduced motion is respected
- **WHEN** the user's system asks for reduced motion
- **THEN** the indicator is shown without animation

### Requirement: Empty views that teach
When the "Working on" list on Home, the practice-sessions view, the friends list or My Files has nothing to show, the system SHALL say in one sentence what will appear there, and SHALL offer the one action that fills it. A cloud-only action SHALL NOT be offered to a signed-out player; the player SHALL be told that signing in enables it.

#### Scenario: An empty list explains itself
- **WHEN** a signed-in player with no practised songs opens Home
- **THEN** "Working on" says that songs they practise will appear there
- **AND** offers a control that opens the song library

#### Scenario: Signed-out players are not offered cloud actions
- **WHEN** a signed-out player opens the empty friends list
- **THEN** it says that signing in lets them add friends
- **AND** no add-friend action is offered

### Requirement: Guidance never gates practice
No onboarding element SHALL prevent a player from reaching any screen, starting any run or using any control. No onboarding element SHALL advance a lesson, skip an item, start or stop listening, or change a verdict. The welcome, the priming card and every tip SHALL be keyboard-operable and dismissible with the Escape key.

#### Scenario: Everything is reachable with guidance ignored
- **WHEN** a first-time player closes the welcome and every tip without reading them
- **THEN** every section, mode and lesson is available exactly as it is without onboarding

#### Scenario: Guidance does not touch the lesson
- **WHEN** a tip is shown or closed during a guided lesson
- **THEN** the current chord, the soft gate's Hint, Skip and Unlock anyway, and the lesson's progress are unchanged

### Requirement: Same guidance shape on both instruments
The welcome, tips, priming card, help control and stuck indicator SHALL be the same components with the same placement and behaviour on Guitar and Vocal, differing only in text. The tip catalogue SHALL cover the equivalent surfaces of both instruments.

#### Scenario: Equivalent surfaces have equivalent tips
- **WHEN** the tip catalogue has a tip for a Guitar section with a Vocal counterpart (Songs, Learn, the practice modes)
- **THEN** the counterpart has a tip of the same kind, shown the same way

### Requirement: Seen guidance is remembered in this browser
The system SHALL record in this browser which tips have been seen and whether the welcome has been completed or dismissed, SHALL work signed out and offline, and SHALL send nothing to the server. If the stored record cannot be read, the system SHALL treat the guidance as unseen rather than fail.

#### Scenario: Seen tips survive a reload
- **WHEN** the player closes a tip and reloads the app
- **THEN** that tip is not shown again

#### Scenario: A broken record falls back to unseen
- **WHEN** the stored onboarding record is missing or unreadable
- **THEN** the app loads normally and treats the welcome and tips as unseen
