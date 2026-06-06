# DeltaFrame

DeltaFrame is a local dev/design helper for AI-assisted UI iteration.

It watches a local prototype, captures many screenshots, keeps only meaningful visual state changes, writes a clean trace folder, and exposes that trace to Codex or another agent through an MCP server.

The goal is simple: help the coding agent see the UI flow closer to the way a human saw it happen.

## Why This Exists

When you work on a prototype, important UI problems often happen between two static screenshots:

- a modal opens and pushes content out of view
- a loading state flashes too quickly
- a form error shifts a button below the fold
- a hover or transition reveals broken spacing
- a fixed patch improves one state but breaks another

Humans notice these changes while interacting. Coding agents usually receive only the current file tree, terminal output, and maybe one screenshot. DeltaFrame creates a compact visual memory of the interaction so the agent can inspect the important states instead of guessing.

## MVP Scope

Version `0.1.0` focuses on local web prototypes.

```text
local URL
  -> Playwright screenshot sampler
  -> pixel diff + duplicate filter
  -> trace.json + PNG frames + PNG diffs
  -> local review UI
  -> MCP tools for Codex
```

Desktop/window capture is intentionally later. The first useful version should be small, stable, and easy to reason about.

## Install

```bash
npm install
npx playwright install chromium
```

On WSL/Ubuntu, Chromium may also need system libraries:

```bash
sudo npx playwright install-deps chromium
```

During local development you can run the CLI directly:

```bash
node ./bin/deltaframe.js --help
```

## Quick Start

Start your app first, then run:

```bash
deltaframe watch --url http://localhost:3000 --name landing-flow --headed
```

Interact with the opened browser. DeltaFrame samples the page, waits for visual changes to settle, and saves only changed states.

Review the captured trace:

```bash
deltaframe review .deltaframe/traces/<trace-folder>
```

Or summarize the newest trace:

```bash
deltaframe summarize
```

## Output

```text
.deltaframe/traces/2026-06-06-landing-flow/
  trace.json
  summary.md
  frames/
    0001-initial.png
    0002-changed-001284ms.png
  diffs/
    0001-0002.png
```

`trace.json` is the source of truth. It records state IDs, timestamps, URLs, screenshot paths, diff paths, changed-pixel metrics, viewport settings, and console warnings/errors observed since the previous state.

## Commands

```bash
deltaframe watch --url <url> [options]
deltaframe review [trace-dir]
deltaframe summarize [trace-dir]
deltaframe mcp [--trace-root .deltaframe/traces]
deltaframe doctor [--browser]
```

Common watch options:

```bash
--duration 15000        # capture duration in ms, use 0 until Ctrl+C
--interval 200          # screenshot sample interval in ms
--idle 350              # wait after a change before saving a stable state
--min-ratio 0.003       # changed-pixel ratio needed to save
--viewport 1440x900
--channel chrome        # optional: use installed Chrome/Edge instead of Playwright Chromium
--full-page
--headed
```

See [docs/CLI.md](docs/CLI.md) for full command details.

## Codex / MCP

Run DeltaFrame as an MCP server:

```bash
deltaframe mcp --trace-root .deltaframe/traces
```

It exposes tools for:

- listing traces
- listing states in a trace
- returning a state image
- comparing two states
- summarizing a trace

See [docs/MCP.md](docs/MCP.md) for Codex config examples.

## Architecture

The current architecture is deliberately boring:

- Node.js CLI
- Playwright browser capture
- `pixelmatch` + `pngjs` image diffing
- static local review server
- newline-delimited JSON-RPC MCP stdio server

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Project Status

This is an initial MVP scaffold. It is useful enough to start testing against real local prototypes, but it is not yet a polished package.

Next priorities:

1. harden the capture loop against animations and hot reloads
2. add manual keep/ignore export from the review UI
3. improve labels with route, action, and DOM metadata
4. package the Codex plugin flow
5. add desktop/region capture mode

See [docs/ROADMAP.md](docs/ROADMAP.md).

## License

MIT
