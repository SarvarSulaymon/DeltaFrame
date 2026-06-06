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

## Install From Source Today

Use this path while the MVP is being tested locally.

```bash
npm install
npx playwright install chromium
```

On WSL/Ubuntu, Chromium may also need system libraries. If `doctor --browser` or `watch` cannot launch Chromium, run:

```bash
sudo npx playwright install-deps chromium
```

Run the CLI directly from the checkout:

```bash
node ./bin/deltaframe.js --help
```

If you want the `deltaframe` command available during local development, link it first:

```bash
npm link
deltaframe --help
```

## Future npm Usage

The package is being prepared for the scoped npm name `@sarvarsulaymon/deltaframe`. The unscoped `deltaframe` package name is already used by an unrelated project.

After the package is published, global usage should look like:

```bash
npm install -g @sarvarsulaymon/deltaframe
deltaframe --help
```

The CLI binary name remains `deltaframe`.

## Development Checks

```bash
npm run check
npm test
npm run doctor
```

Browser launch smoke testing is opt-in because it needs a local Playwright browser install:

```bash
npx playwright install chromium
npm run test:browser
```

On WSL/Ubuntu, run `sudo npx playwright install-deps chromium` if Chromium needs system libraries.

## Quick Start

Start your app first, then run from a source checkout:

```bash
node ./bin/deltaframe.js watch --url http://localhost:3000 --name landing-flow --headed
```

If you already ran `npm link` or installed the future npm package globally, use:

```bash
deltaframe watch --url http://localhost:3000 --name landing-flow --headed
```

Interact with the opened browser. DeltaFrame samples the page, waits for visual changes to settle, and saves only changed states.

Review the captured trace:

```bash
node ./bin/deltaframe.js review .deltaframe/traces/<trace-folder>
```

In the review UI, use Keep/Ignore to curate noisy states. DeltaFrame saves those choices as `curation.json`, and Export Kept creates a new complete trace folder containing only kept states.

Or summarize the newest trace:

```bash
node ./bin/deltaframe.js summarize
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
--mask '[{"x":0,"y":0,"width":160,"height":40,"label":"clock"}]'
--viewport 1440x900
--channel chrome        # optional: use installed Chrome/Edge instead of Playwright Chromium
--full-page
--headed
```

Use `--mask` or `--mask-file` for clocks, cursors, animated banners, and other dynamic regions that should be ignored during image diffing. Masks are saved in trace settings, but frame PNGs stay unmasked.

See [docs/CLI.md](docs/CLI.md) for full command details.

## MCP Setup

From a source checkout, run DeltaFrame as an MCP server with Node:

```bash
node ./bin/deltaframe.js mcp --trace-root .deltaframe/traces
```

It exposes tools for:

- capturing a URL into a new trace
- finding the latest trace
- returning the review command and local URL for a trace
- listing traces
- listing states in a trace
- returning a state image
- comparing two states
- summarizing a trace

See [docs/MCP.md](docs/MCP.md) for Codex config examples, including a local-checkout config that points at `bin/deltaframe.js`.

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
2. improve labels with route, action, and DOM metadata
3. group console and network errors in traces
4. add before/after recapture prompts for Codex
5. add desktop/region capture mode

See [docs/ROADMAP.md](docs/ROADMAP.md).

## License

MIT
