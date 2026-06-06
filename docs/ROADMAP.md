# Roadmap

DeltaFrame should stay narrow: a helper for visual state memory during AI-assisted UI iteration.

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
- [ ] manual keep/ignore in review UI
- [ ] export curated trace
- [ ] route-aware labels
- [ ] console/network error grouping
- [ ] option to mask dynamic regions
- [ ] option to pause/resume capture from the terminal

## 0.3 Agent Workflow

- [ ] stronger MCP resource support
- [ ] prompt templates for UI review
- [ ] Codex plugin marketplace polish
- [ ] trace annotations for human feedback
- [ ] before/after verification loop

## 0.4 Desktop Capture

- [ ] selected region capture
- [ ] selected window capture
- [ ] monitor capture
- [ ] privacy redaction/masking
- [ ] platform-specific permission docs

Candidate tools:

- Python `mss` for simple cross-platform screen regions
- Rust `xcap` for a stronger native capture core
- FFmpeg for video import and scene-change extraction
- OpenCV/scikit-image for more advanced visual similarity

## 0.5 Test Integration

- [ ] Playwright scripted flow capture
- [ ] attach DeltaFrame traces to failed tests
- [ ] visual regression baseline comparison
- [ ] CI-friendly non-interactive mode

## Non-Goals

- hosted screenshot storage
- generic screen recorder
- replacing Playwright visual regression testing
- automatically uploading private screen content
