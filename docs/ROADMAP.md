# Roadmap

DeltaFrame should stay narrow: a helper for visual state memory during AI-assisted UI iteration.

Current product correction: DeltaFrame should be a dense capture and keyframe distillation tool. The first implementation saved sparse changed states during capture, which can miss the process a human wanted Codex to see. The next work should preserve enough raw visual evidence first, then select meaningful frames afterward.

## 0.1 MVP

- [x] Node CLI
- [x] Playwright web capture
- [x] changed-frame detection
- [x] PNG diff generation
- [x] trace folder format
- [x] local review UI
- [x] MCP stdio server
- [x] Codex plugin shell
- [x] docs

## 0.2 Better Capture

- [x] MCP tool to capture a URL into a new trace
- [x] MCP tool to find the latest trace
- [x] MCP-safe review handoff command
- [x] manual keep/ignore in review UI
- [x] export curated trace
- [x] dogfood proof loop through MCP: capture an actual local prototype trace, curate/export it if useful, then have Codex use that trace to make one concrete UI improvement
- [x] route-aware labels
- [x] console/network error grouping
- [x] option to mask dynamic regions
- [x] option to pause/resume capture from the terminal

## 0.3 Agent Workflow

- [x] stronger MCP resource support
- [x] prompt templates for UI review
- [x] Codex plugin marketplace polish
- [x] trace annotations for human feedback
- [x] before/after verification loop

## 0.4 Desktop Capture

- [x] selected region capture
- [x] selected window capture
- [x] monitor capture
- [x] privacy redaction/masking
- [x] platform-specific permission docs

Candidate tools:

- Python `mss` for simple cross-platform screen regions
- Rust `xcap` for a stronger native capture core
- FFmpeg for video import and scene-change extraction
- OpenCV/scikit-image for more advanced visual similarity

## 0.5 Test Integration

- [x] Playwright scripted flow capture
- [x] attach DeltaFrame traces to failed tests
- [x] visual regression baseline comparison
- [x] CI-friendly non-interactive mode

## 0.6 Frame Distillation Correction

- [x] web `watch` raw-frame archive with configurable fps, for example `--fps 30`
- [x] separate raw frames from selected keyframes in the trace folder format
- [x] post-capture keyframe selector that keeps meaningful moments instead of deciding everything live
- [x] duplicate clustering so stable screens appear once instead of many times
- [ ] cursor-aware filtering for desktop/window capture
- [ ] noise filters for blinking carets, timestamps, shimmer, and tiny animation loops
- [x] keyframe reasons in metadata, for example `first-frame`, `route-change`, `visual-change`, `last-frame`
- [x] MCP tools/resources that expose selected keyframes as the primary Codex input
- [ ] review UI that treats diffs as secondary debug artifacts, not the main product output
- [ ] update `watch` defaults so a 10 second capture can preserve the process, then distill it

## Non-Goals

- hosted screenshot storage
- generic screen recorder
- replacing Playwright visual regression testing
- automatically uploading private screen content
