# Architecture

DeltaFrame is a local-first tool. It should not upload screenshots by itself or depend on a hosted service. The agent integration should ask for trace data when needed.

## System Shape

```text
Prototype / local URL or desktop source
        |
        v
Playwright capture loop or optional MSS desktop backend
        |
        v
PNG frame buffer
        |
        v
pixelmatch diff engine
        |
        v
state selector
        |
        v
trace folder
        |
        +--> review UI
        |
        +--> MCP stdio server
```

## Components

### CLI

Entry point: `bin/deltaframe.js`

The CLI dispatches to capture, review, summary, doctor, and MCP commands. It uses plain Node.js ESM so the MVP has no build step.

### Capture Engine

Files:

- `src/capture/playwrightWatcher.js`
- `src/capture/desktopWatcher.js`
- `src/capture/mss_backend.py`

The capture engine opens a Chromium page with Playwright and samples screenshots at a fixed interval. It saves the initial state, then compares each candidate screenshot against the last saved state.

The current state-selection algorithm:

1. capture candidate frame
2. diff candidate against last saved state
3. ignore if changed-pixel ratio is below `--min-ratio`
4. wait `--idle` ms so transitions can settle
5. capture a stable frame
6. diff stable frame against last saved state
7. save if it still exceeds `--min-ratio`

This prevents saving every animation tick while still catching useful UI state transitions.

Desktop capture follows the same state-selection loop, but the frame source is an optional Python `mss` backend. It supports monitor, absolute region, and native Windows window-title capture. Desktop traces use `source.type: "desktop"` and still write `trace.json`, `summary.md`, `frames/`, and `diffs/`.

Saved-frame redactions are applied before diffing and writing PNGs. Diff masks still only affect changed-pixel calculation.

### Diff Engine

File: `src/diff/imageDiff.js`

The diff engine uses `pngjs` to decode PNG buffers and `pixelmatch` to calculate changed pixels and generate a diff image.

If screenshot dimensions differ, both images are normalized onto same-size white canvases before diffing.

### Trace Store

File: `src/trace/store.js`

The trace store creates trace folders, writes `trace.json`, writes `summary.md`, finds the latest trace, and lists available traces.

Trace output is intentionally file-based so users can inspect, commit, attach, or delete it without a database.

### Review UI

File: `src/review/server.js`

The review command starts a local HTTP server and renders a static timeline UI. It is intentionally dependency-free. The UI shows each state, the visual diff from the previous state, metadata, and console warnings/errors.

### MCP Server

File: `src/mcp/server.js`

The MCP server is a small newline-delimited JSON-RPC stdio server. It exposes DeltaFrame trace tools to Codex-compatible MCP clients.

It currently supports:

- `initialize`
- `ping`
- `tools/list`
- `tools/call`
- `resources/list`
- `resources/read`

## Why Web Mode First

Desktop screen capture is useful but expensive in complexity:

- OS permissions
- multi-monitor behavior
- privacy risk
- foreground/background differences
- window selection APIs
- Wayland/macOS/Windows differences

Local web prototypes give us a cleaner first version:

- deterministic viewport
- route/title metadata
- console errors
- screenshots without OS-level capture permission
- better fit for frontend work with Codex

## Capture Modes

DeltaFrame currently supports:

- `web` mode with Playwright
- `desktop` mode for selected monitor/region/window through the optional MSS backend

DeltaFrame should eventually support:

- `video-import` mode using FFmpeg scene detection
- `test` mode that captures states from scripted Playwright flows

Each mode should write the same trace format.
