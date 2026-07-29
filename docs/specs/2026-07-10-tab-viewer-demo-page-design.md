# Tab Viewer Demo Page Design

## Goal

Define a product-grade visual language and demo page structure for Tab Viewer's current Browser Demo so that internal reviewers see a coherent practice workspace rather than a technical verification page.

This design is intentionally scoped to the current Guitar Pro demo flow:

- open a local GP file
- render the score
- control playback
- adjust speed
- create and activate named AB loops
- manage visible tracks and playback mix
- surface restore and sidecar-related status

The design should improve product quality perception now, while preserving a clean upgrade path toward a denser professional workstation later.

## Product Context

Tab Viewer is a practice-oriented score viewer, not a notation editor and not a content library. Its current demo already proves a meaningful user loop:

1. choose a local GP file
2. enter a single practice workspace
3. read the score
4. play, pause, seek, slow down, and loop
5. adjust track behavior
6. restore prior practice context through sidecar and local resume

The page design therefore must communicate "focused practice workspace" first, not "feature showcase" or "engineering sandbox."

## Audience And Demo Intent

Primary audience for this page is internal review.

The page should help reviewers quickly understand:

- the product has a clear interaction model
- the current GP practice slice is already coherent
- the information architecture is ready for desktop productization
- future expansion can happen without changing the core page model

## Recommended Design Direction

### Selected Direction

Use **Calm Precision** as the current visual language.

This direction should feel:

- calm
- exact
- professional
- readable for long sessions
- closer to a focused desktop tool than a generic web dashboard

### Why This Direction

Calm Precision is the best fit for the current milestone because it:

- supports internal evaluation better than a marketing-heavy presentation
- keeps the score as the visual hero
- matches the practice-oriented nature of the product
- avoids prematurely overcommitting to an aggressive pro-tool aesthetic
- leaves room to evolve into a denser `Studio Workbench` direction later

### Future Evolution Path

The current design should intentionally preserve a path toward **Studio Workbench** in a later phase.

That later evolution can increase:

- panel density
- darker structural layering
- stronger workstation cues
- richer track and session tooling

without replacing the page architecture defined in this document.

## Narrative Strategy

Use a **workspace-first** narrative.

The first impression should be that the user has entered a real practice environment, not a landing page with an embedded demo. The interface should orient around the active score session and the practice workflow, with no separate marketing hero section.

## Core Design Principles

### 1. Score First

The score is the visual center of gravity. Controls and metadata exist to support reading and practice, not to compete with the notation area.

### 2. Practice As The Primary Task

Playback, speed, looping, and track behavior should read as the main operational layer of the page.

### 3. Session Context Always Visible

The current file, restore state, and relevant practice context should remain legible without scattering status across unrelated regions.

### 4. Calm Over Flash

The UI should convey maturity through proportion, restraint, and consistency rather than through dramatic color or decorative motion.

### 5. Structure Ready For Growth

The page should already have stable regions that can absorb future additions such as richer practice statistics, count-in, metronome, or denser track tooling.

## Page Architecture

The page should be organized into five persistent regions.

### 1. Top Context Bar

Purpose:

- establish product identity
- anchor the active session
- unify file and restore status

Recommended contents:

- product name
- current file name
- optional score summary such as title and artist
- primary `Open File` action
- session-level status text or badge
- lightweight restore hint when applicable

Behavior notes:

- this bar replaces the current loose combination of file picker and status line
- file and session status should be expressed here first
- the current score context should remain stable while the user works elsewhere on the page

### 2. Main Transport Bar

Purpose:

- present the primary practice controls in one coherent row
- make playback feel like the central action of the product

Recommended contents:

- play or pause
- stop
- current time and total duration
- progress slider
- speed slider and speed value
- audio readiness state

Behavior notes:

- play should be the visually dominant action
- stop and retry actions should be secondary
- progress needs enough horizontal space to feel precise rather than cramped
- audio state should appear as a compact product-style status treatment, not as a test control

### 3. Score Stage

Purpose:

- provide a stable reading surface for alphaTab rendering
- visually frame the score as the primary artifact

Recommended structure:

- an outer stage container with soft separation from the app background
- a high-clarity inner score surface
- generous but controlled padding
- stable scroll behavior

Behavior notes:

- the stage should feel like a reading desk
- the notation area must stay visually cleaner than the surrounding chrome
- empty state should still look productized, with a clear call to choose a local GP file and a short privacy reassurance that files stay local

### 4. Right Practice Panel

Purpose:

- concentrate all practice-related configuration in one predictable place
- support future professional density without changing the page skeleton

Top-level sections:

- `Loop`
- `Tracks`
- `Session`

#### Loop

Should contain:

- loop enabled toggle
- set A / set B / save range controls
- snap mode
- current loop boundaries
- saved loop list

Design notes:

- loop actions should be compact and operational
- saved loops should read like reusable practice presets rather than raw form fields
- the active loop must be easy to identify

#### Tracks

Should contain:

- primary visible track selection
- additional visible tracks selection
- per-track mute
- per-track solo
- per-track volume

Design notes:

- track name must remain the dominant identifier
- display-related settings and playback-related settings should be visually separated
- per-track rows should be orderly and readable, not checkbox clusters

#### Session

Should contain:

- score summary
- restore status
- sidecar persistence state
- recoverable warnings or errors

Design notes:

- this is a low-urgency system-information area
- it should support credibility and debugging during review without competing with core interaction

### 5. Bottom Context Strip

Purpose:

- surface domain-level facts in a compact way
- strengthen the feel of a dedicated practice workstation

Recommended contents:

- title
- artist
- track count
- bar count
- tempo
- active loop
- primary track

Behavior notes:

- it should behave like a quiet status strip, not a card collection
- it gives reviewers fast confirmation that the product is organized around real score and practice entities

## Visual Language

### Overall Tone

The interface should feel like a quiet professional tool: modern, composed, and detail-conscious. It should avoid both the heaviness of a full workstation and the generic look of a SaaS admin product.

### Color Model

Use cool neutrals with one restrained accent color.

Suggested palette direction:

- page background: soft cool gray
- primary surface: white or near-white
- alternate surface: very light cool gray
- borders: low-contrast structural gray
- text primary: dark cool charcoal
- text secondary: muted slate
- accent: low-saturation teal or blue-green
- accent soft: pale tinted support background
- danger: controlled warm brick red

Example working values:

- `#F3F5F7`
- `#FFFFFF`
- `#F8FAFB`
- `#D9E0E6`
- `#182028`
- `#5F6B76`
- `#1F7A6B`
- `#DDF3EE`
- `#B24C43`

These values are directional rather than final tokens. The important choice is a restrained, cool, low-noise system.

### Typography

Typography should communicate precision, not promotion.

Recommendations:

- use a clean system sans for interface text
- keep headings moderate in size
- use tabular numerals for time, percentages, and other changing numeric values
- rely on spacing and region hierarchy more than on oversized type

Suggested scale direction:

- context and controls: `13-14px`
- panel section titles: `12-13px`
- secondary status text: `12-13px`
- avoid oversized hero text in the main product workspace

### Shape, Depth, And Layering

Recommendations:

- medium-small corner radius
- minimal shadows
- define hierarchy primarily through surfaces, borders, and spacing
- use stronger contrast inside the score surface than in the surrounding chrome

This page should feel lightly layered, not card-heavy.

## Component Behavior And States

### Primary Action Hierarchy

The dominant interaction order should be:

1. open file
2. play or pause
3. seek and speed adjustment
4. loop operations
5. track adjustments
6. session inspection

### Status Language

Statuses such as loading, ready, restored, unsaved, audio unavailable, or persistence error should use a unified visual pattern across the page.

Recommended treatment:

- compact labels or badges
- consistent tone and placement
- no ad hoc red body text unless the state is actually blocking or failed

### Empty State

The score stage empty state should be product-grade.

Recommended copy structure:

- clear title inviting the user to open a GP file
- short note on supported file types
- primary action button
- short reassurance that files remain local

### Error Handling

The design should assume the current error cases already present in the product:

- file load failure
- unsupported or corrupted file
- audio initialization failure
- persistence or restore failure

Visual rules:

- keep score reading available when audio fails
- place session-wide issues in Context Bar or Session panel
- avoid dumping low-level error wording into the main reading surface
- errors should degrade the experience gracefully rather than collapse the layout

## Responsiveness

The design should prioritize desktop use while remaining usable in narrow widths.

### Desktop

Preferred experience:

- persistent right practice panel
- generous score stage width
- long progress slider
- full bottom context strip

### Narrow Width

Adaptations:

- keep Context Bar and Transport Bar intact but allow wrapping
- move the right panel below the score stage
- preserve section grouping order: `Loop`, `Tracks`, `Session`
- keep the score stage readable and visually primary

The narrow layout should remain a compact practice workspace, not collapse into a generic stacked form page.

## Implementation Guidance For The Existing Demo

This design applies directly to the current Browser Demo structure.

Most leverage should come from:

- promoting the file bar into a true Context Bar
- redesigning the transport row with clearer action hierarchy
- wrapping the score area in a stronger stage treatment
- restructuring the right inspector into explicit practice modules
- adding a compact bottom context strip
- standardizing status visuals

No change in product scope is required for this design. It is primarily an information architecture and visual hierarchy refinement over the existing demo.

## Highest-Impact First Changes

If implementation must be phased, prioritize:

1. Context Bar redesign
2. Transport Bar redesign
3. productized score-stage empty state
4. right-panel restructuring into `Loop`, `Tracks`, `Session`
5. unified state label system

These five changes provide the biggest jump from technical demo to internal-review-ready product demo.

## Success Criteria

The redesign is successful if an internal reviewer can understand the page within a few seconds as:

- a single practice workspace
- centered on a loaded score
- built around playback and repetition
- capable of restoring practice context
- visually mature enough to serve as the foundation of a desktop product

## Non-Goals

This design does not attempt to:

- add new product scope beyond the current GP demo slice
- solve MIDI presentation
- define a full cross-platform design system
- commit to the future denser workstation aesthetic now
- introduce marketing or landing-page storytelling above the workspace

## Testing And Review

The implemented page should be reviewed against these questions:

- Is the score still the clear visual focal point?
- Does the page read as a product workspace rather than a test harness?
- Are playback and loop actions easier to scan than before?
- Are session and persistence states easier to understand?
- Does the layout still feel stable at narrow widths?
- Can this structure grow toward a denser workstation without a redesign?
