# DeltaFrame

DeltaFrame is a local dev/design helper for AI-assisted UI iteration.

It watches a local prototype, captures many screenshots, keeps only meaningful visual state changes, writes a clean trace folder, and exposes that trace to Codex or another agent through an MCP server.

The goal is simple: help the coding agent see the UI flow closer to the way a human saw it happen.

Important correction: the core product should be a visual memory condenser, not a visual regression tool. The ideal loop is dense capture first, then keyframe distillation for Codex. See [docs/PRODUCT_INTENT.md](docs/PRODUCT_INTENT.md).

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
  -> dense raw frames
  -> keyframe distillation + noise filtering
  -> trace.json + selected PNG frames + debug PNG diffs
  -> local review UI
  -> MCP tools for Codex
```

Desktop/window capture uses the same trace shape through an optional Python `mss` backend.

The core behavior is now raw capture first, then selected keyframes. Sparse live changed-state capture still exists behind `--sparse` for comparison and CI-style use.

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

Interact with the opened browser. By default, DeltaFrame records 10 seconds at 10 fps, archives the raw timeline under `raw/`, then writes selected Codex-facing keyframes under `frames/`. Use `--fps 30` for a denser run or `--sparse` for the older live changed-state sampler.

In an interactive terminal, press `p` to pause or resume capture without closing the browser, `q` to stop and write the trace, or Ctrl+C to stop. Use `--no-controls` for CI and other non-interactive runs.

Review the captured trace:

```bash
node ./bin/deltaframe.js review .deltaframe/traces/<trace-folder>
```

In the review UI, use Keep/Ignore and per-state notes to curate noisy states. DeltaFrame saves those choices as `curation.json`, and Export Kept creates a new complete trace folder containing only kept states plus their notes.

Capture a desktop region or monitor when the optional Python `mss` backend is installed:

```bash
python -m pip install mss
node ./bin/deltaframe.js desktop --region 0,0,1200,800 --redact '[{"x":0,"y":0,"width":320,"height":120}]'
```

Or summarize the newest trace:

```bash
node ./bin/deltaframe.js summarize
```

Compare a before/after pair after making UI changes:

```bash
node ./bin/deltaframe.js compare .deltaframe/traces/before .deltaframe/traces/after --focus "checkout spacing"
```

## Output

```text
.deltaframe/traces/2026-06-06-landing-flow/
  trace.json
  summary.md
  frames/
    0001-first-frame.png
    0002-keyframe-001284ms.png
  diffs/
    0001-0002.png
  raw/
    raw-000001-initial.png
    raw-000002-sample.png
```

`trace.json` is the source of truth. It records raw-frame paths, selected keyframe IDs, timestamps, URLs, screenshot paths, debug diff paths, changed-pixel metrics, viewport settings, and console warnings/errors observed since the previous selected keyframe.

## Commands

```bash
deltaframe watch --url <url> [options]
deltaframe desktop [--region x,y,width,height | --monitor n | --window-title text]
deltaframe flow --url <url> --script <file>
deltaframe review [trace-dir]
deltaframe summarize [trace-dir]
deltaframe compare <before-trace-dir> <after-trace-dir>
deltaframe mcp [--trace-root .deltaframe/traces]
deltaframe doctor [--browser] [--desktop]
```

Common watch options:

```bash
--duration 15000        # capture duration in ms, use 0 until Ctrl+C
--interval 200          # screenshot sample interval in ms
--fps 30                # raw capture fps; implies --raw-frames
--raw-frames            # archive sampled screenshots under raw/
--idle 350              # wait after a change before saving a stable state
--min-ratio 0.003       # changed-pixel ratio needed to save
--mask '[{"x":0,"y":0,"width":160,"height":40,"label":"clock"}]'
--viewport 1440x900
--channel chrome        # optional: use installed Chrome/Edge instead of Playwright Chromium
--full-page
--headed
--no-controls           # disable p/q interactive terminal controls
```

Use `--mask` or `--mask-file` for clocks, cursors, animated banners, and other dynamic regions that should be ignored during image diffing. Masks are saved in trace settings, but frame PNGs stay unmasked.

See [docs/CLI.md](docs/CLI.md) for full command details.
See [docs/DESKTOP_CAPTURE.md](docs/DESKTOP_CAPTURE.md) for screen/window capture setup and permissions.
See [docs/TEST_INTEGRATION.md](docs/TEST_INTEGRATION.md) for scripted flow capture, CI comparison budgets, and failed-test attachment helpers.

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
- comparing before/after traces for verification
- summarizing a trace

See [docs/MCP.md](docs/MCP.md) for Codex config examples, including a local-checkout config that points at `bin/deltaframe.js`.

## Codex plugin (repo-local marketplace)

This repository includes a local Codex plugin at `plugins/deltaframe-codex`.

To make it visible in Codex:

1. Add the repo marketplace file:

```bash
codex plugin marketplace add <repo-root>/.agents/plugins/marketplace.json
```

2. Install from that marketplace:

```bash
codex plugin add deltaframe-codex@deltaframe-local
```

3. In Codex, open the `DeltaFrame Local` marketplace and verify the plugin appears as `DeltaFrame Review Companion`.

## Architecture

The current architecture is deliberately boring:

- Node.js CLI
- Playwright browser capture
- `pixelmatch` + `pngjs` image diffing
- static local review server
- newline-delimited JSON-RPC MCP stdio server

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Project Status

This is an initial MVP scaffold. It is useful enough to start testing against real local prototypes, but the first real-world test showed an important product gap: sparse live diffing can miss the process a human wanted Codex to see.

Next priorities:

1. build post-capture keyframe distillation on top of the raw-frame archive
2. cluster duplicate/stable frames so repeated screens appear once
3. ignore cursor and other high-noise regions during selection
4. expose selected keyframes to Codex as the primary MCP surface
5. keep diffs/review UI as secondary debugging and curation tools

See [docs/ROADMAP.md](docs/ROADMAP.md).

## License

MIT
