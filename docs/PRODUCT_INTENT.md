# Product Intent

DeltaFrame is not primarily a visual regression tool, screenshot gallery, or UI-review chatbot.

DeltaFrame exists because Codex does not naturally see a UI process the way a human sees it while interacting with a prototype. The useful product is a visual memory condenser:

```text
capture the visual process densely
  -> remove noise and duplicates
  -> select meaningful frames
  -> give Codex the small set of frames it needs
```

The raw capture can be large. A 10 second interaction at 30 fps may produce 300 frames. That is acceptable as local intermediate data. The value is in distilling those frames down to the few moments Codex should inspect.

## Correct Mental Model

The user should be able to run a capture while using the app normally. DeltaFrame should quietly observe:

- loading screens
- route changes
- modals, drawers, popovers, and menus
- hover/focus/active states
- layout shifts
- validation and error states
- completed stable screens
- regressions introduced after a code edit

Then DeltaFrame should produce a compact keyframe set. Codex should not need every raw frame, and the human should not need to manually record a screen video, pause it, crop frames, and paste them one by one.

## What Went Wrong In The First Version

The current `watch` loop tries to be smart during capture:

```text
sample frame
  -> compare with last saved frame
  -> wait for idle
  -> save only if changed enough
```

That made the tool too sparse. In a real app, it can capture only two states, such as:

1. an auth/loading screen
2. the final loaded workspace

Technically that is a valid trace, but it misses the user's real need: preserving enough of the process so useful frames can be selected afterward.

The pixel diff image is also not the product. Diffs are useful diagnostic artifacts, but the main output should be meaningful screenshots/keyframes for Codex.

## Target Pipeline

The next core architecture should be:

```text
source: page, window, monitor, or video
  -> dense raw frame capture
  -> cursor/noise suppression
  -> duplicate clustering
  -> stability detection
  -> keyframe selection
  -> Codex frame package
```

### Dense Raw Capture

Capture at an explicit frame rate such as 10, 15, or 30 fps. The frame rate should be configurable. Raw frames may be stored temporarily, compressed, or represented as a video plus extracted frames.

### Noise Suppression

DeltaFrame should ignore or reduce signals that do not help Codex:

- mouse cursor movement
- blinking carets
- clocks/timestamps
- loading shimmer
- small animated decorations
- compression or antialiasing noise

For Playwright page screenshots, the OS cursor usually is not captured. For desktop/window capture, cursor hiding, masking, or cursor-aware filtering is required.

### Keyframe Selection

After raw capture, DeltaFrame should select meaningful frames. Selection should be explainable and local-first:

- first frame
- last stable frame
- first stable frame after loading
- route/title changes
- major layout changes
- modal/drawer/popover open and close
- error or validation appearance
- large content replacement
- frames around user-marked moments

This should happen after capture, not as the only capture decision.

### Codex Frame Package

Codex should receive a compact package:

- selected keyframe images
- timestamps
- labels/reasons for selection
- optional before/after pairs
- optional raw-frame pointers for deeper inspection

Codex should not need to inspect every raw frame by default.

## Product Boundaries

DeltaFrame should stay narrow:

- local-first
- no automatic upload
- no generic screen recorder UI
- no heavy machine-learning dependency in the core path
- no attempt to replace Playwright assertions or visual regression services

It can support testing and comparison, but those are secondary. The center is still: help Codex see the visual process.

## Immediate Product Correction

The next roadmap work should focus on replacing sparse live state capture with a two-stage mode:

1. record dense frames locally
2. distill keyframes for Codex

Existing review UI, MCP tools, diffs, annotations, and before/after comparison remain useful, but they should sit after the distillation layer instead of defining the core experience.
