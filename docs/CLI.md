# CLI

DeltaFrame exposes one executable:

```bash
deltaframe
```

For local development:

```bash
node ./bin/deltaframe.js
```

## `watch`

Capture meaningful visual state changes from a local web prototype.

```bash
deltaframe watch --url http://localhost:3000 --name landing-flow --headed
```

Options:

| Option | Default | Description |
| --- | ---: | --- |
| `--url` | required | URL to open. Localhost and file URLs are the intended MVP targets. |
| `--name` | inferred | Human name for the trace folder and metadata. |
| `--out` | `.deltaframe/traces` | Root directory for captured traces. |
| `--duration` | `15000` | Capture duration in milliseconds. Use `0` to run until Ctrl+C. |
| `--interval` | `200` | Screenshot sample interval in milliseconds. |
| `--idle` | `350` | Time to wait after detecting a change before saving a stable frame. |
| `--min-ratio` | `0.003` | Minimum changed-pixel ratio required to save a new state. |
| `--pixel-threshold` | `0.12` | Per-pixel sensitivity passed to pixelmatch. |
| `--max-frames` | `80` | Stop after saving this many states. |
| `--viewport` | `1440x900` | Browser viewport. |
| `--channel` | Playwright default | Browser channel, for example `chrome` or `msedge`. Useful if Playwright browsers are not installed. |
| `--verbose` | `false` | Print capture setup details to stderr. |
| `--full-page` | `false` | Capture the whole scrollable page instead of viewport. |
| `--headed` | `false` | Show Chromium so you can interact manually. |

Examples:

```bash
deltaframe watch --url http://localhost:5173 --name onboarding --duration 30000 --headed
deltaframe watch --url file:///Users/me/prototype/index.html --full-page
deltaframe watch --url http://localhost:3000 --min-ratio 0.001 --idle 500
```

## `review`

Open a local review UI for a trace.

```bash
deltaframe review .deltaframe/traces/2026-06-06-landing-flow
```

If no trace directory is provided, DeltaFrame uses the newest trace under `.deltaframe/traces`.

```bash
deltaframe review
```

Options:

| Option | Default | Description |
| --- | ---: | --- |
| `--port` | `7799` | Local HTTP port. |

## `summarize`

Print `summary.md` for a trace.

```bash
deltaframe summarize
deltaframe summarize .deltaframe/traces/2026-06-06-landing-flow
```

## `mcp`

Start the DeltaFrame MCP stdio server.

```bash
deltaframe mcp --trace-root .deltaframe/traces
```

The MCP server writes only JSON-RPC messages to stdout. Diagnostics go to stderr.

MCP tools can capture a URL, find the latest trace, return a review command, list traces and states, fetch state images, compare states, and summarize traces. See [MCP.md](MCP.md) for tool schemas.

## `doctor`

Check local runtime dependencies.

```bash
deltaframe doctor
deltaframe doctor --browser
```

It checks for:

- `playwright`
- `pixelmatch`
- `pngjs`

With `--browser`, it also tries to launch Chromium. On WSL/Ubuntu, a failed browser launch usually means system packages are missing:

```bash
sudo npx playwright install-deps chromium
```
