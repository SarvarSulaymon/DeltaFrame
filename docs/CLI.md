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
| `--mask` | none | JSON mask region or array of regions ignored during diffing, for example `'[{"x":0,"y":0,"width":160,"height":40,"label":"clock"}]'`. |
| `--mask-file` | none | Path to a JSON file containing mask region(s). |
| `--max-frames` | `80` | Stop after saving this many states. |
| `--viewport` | `1440x900` | Browser viewport. |
| `--channel` | Playwright default | Browser channel, for example `chrome` or `msedge`. Useful if Playwright browsers are not installed. |
| `--verbose` | `false` | Print capture setup details to stderr. |
| `--full-page` | `false` | Capture the whole scrollable page instead of viewport. |
| `--headed` | `false` | Show Chromium so you can interact manually. |
| `--no-controls` | `false` | Disable interactive terminal controls. |

When `watch` runs from an interactive terminal, DeltaFrame prints concise controls to stderr:

- `p` pauses or resumes capture without closing the browser.
- `q` stops capture and writes the trace.
- Ctrl+C still stops capture.

Paused captures keep the browser open but do not take screenshots or save states. Use `--no-controls` for CI or other non-interactive runs.

Examples:

```bash
deltaframe watch --url http://localhost:5173 --name onboarding --duration 30000 --headed
deltaframe watch --url file:///Users/me/prototype/index.html --full-page
deltaframe watch --url http://localhost:3000 --min-ratio 0.001 --idle 500
deltaframe watch --url http://localhost:3000 --mask '[{"x":0,"y":0,"width":160,"height":40,"label":"clock"}]'
deltaframe watch --url http://localhost:3000 --mask-file examples/masks.json
```

Mask rectangles use screenshot pixel coordinates:

```json
[
  { "x": 0, "y": 0, "width": 160, "height": 40, "label": "clock" }
]
```

Masks affect diffing only. DeltaFrame still saves the original unmasked screenshots so humans and agents can inspect the real UI, while `trace.json` records the applied masks under `settings.masks`.

## `desktop`

Capture meaningful visual changes from a local screen, monitor, selected region, or visible window. Desktop capture uses an optional Python `mss` backend, so install it in the Python environment DeltaFrame will call:

```bash
python -m pip install mss
```

List monitor indexes:

```bash
deltaframe desktop --list
```

Capture a selected region:

```bash
deltaframe desktop --region 0,0,1200,800 --name desktop-region
```

Capture a monitor:

```bash
deltaframe desktop --monitor 1 --name monitor-one
```

Capture a visible window by title substring on native Windows:

```bash
deltaframe desktop --window-title "Prototype" --name prototype-window
```

Desktop options:

| Option | Default | Description |
| --- | ---: | --- |
| `--list` | `false` | List monitor sources visible to the Python `mss` backend. |
| `--list-windows` | `false` | List visible windows when supported. |
| `--region` | none | Absolute screen region as `x,y,width,height`. |
| `--monitor` | first real monitor | MSS monitor index. Index `0` is the virtual desktop. |
| `--window-title` | none | Visible window title substring. Currently supported on native Windows. |
| `--python` | auto | Python executable for the backend. Useful from WSL when using host Python. |
| `--out` | `.deltaframe/traces` | Root directory for captured traces. |
| `--duration` | `10000` | Capture duration in milliseconds. |
| `--interval` | `500` | Screenshot sample interval in milliseconds. |
| `--idle` | `350` | Time to wait after detecting a change before saving a stable frame. |
| `--min-ratio` | `0.003` | Minimum changed-pixel ratio required to save a new state. |
| `--pixel-threshold` | `0.12` | Per-pixel sensitivity passed to pixelmatch. |
| `--mask` | none | Region(s) ignored during diffing only. Saved screenshots remain unchanged. |
| `--mask-file` | none | Read diff mask region(s) from a JSON file. |
| `--redact` | none | Region(s) blacked out in saved screenshots before diffing and writing. |
| `--redact-file` | none | Read redaction region(s) from a JSON file. |
| `--max-frames` | `80` | Stop after saving this many states. |

Use `--redact` for private screen areas that should not be written to disk:

```bash
deltaframe desktop --monitor 1 --redact '[{"x":0,"y":0,"width":320,"height":120,"label":"account"}]'
```

See [DESKTOP_CAPTURE.md](DESKTOP_CAPTURE.md) for platform permissions and support notes.

## `flow`

Run a scripted Playwright flow and save DeltaFrame states during the script. The script must be an ES module exporting a default async function or a named `run` function.

```bash
deltaframe flow --url http://localhost:3000 --script ./flows/onboarding.js --name onboarding-flow
```

Flow script example:

```js
export default async function ({ page, capture }) {
  await capture("landing");
  await page.getByRole("button", { name: "Get Started" }).click();
  await capture("after get started");
}
```

DeltaFrame automatically captures `initial` before the script and `final` after it. If the script throws, DeltaFrame attempts a `failure` capture, writes the trace, prints the trace path, then exits non-zero.

Options:

| Option | Default | Description |
| --- | ---: | --- |
| `--url` | required | URL to open before running the script. |
| `--script` | required | ES module flow script. |
| `--name` | inferred | Human name for the trace. |
| `--out` | `.deltaframe/traces` | Root directory for captured traces. |
| `--viewport` | `1440x900` | Browser viewport. |
| `--channel` | Playwright default | Browser channel, for example `chrome` or `msedge`. |
| `--headed` | `false` | Show Chromium while the flow runs. |
| `--full-page` | `false` | Capture the whole scrollable page. |
| `--mask` / `--mask-file` | none | Region(s) ignored during diffing. |
| `--redact` / `--redact-file` | none | Region(s) blacked out before writing screenshots. |

## `review`

Open a local review UI for a trace.

```bash
deltaframe review .deltaframe/traces/2026-06-06-landing-flow
```

If no trace directory is provided, DeltaFrame uses the newest trace under `.deltaframe/traces`.

```bash
deltaframe review
```

The review UI lets you mark individual states as kept or ignored and add per-state notes for Codex. Choices are saved in `curation.json` inside the trace folder, and the Export Kept action writes a new complete trace folder with only kept states and notes for those kept states.

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

## `compare`

Compare a trace captured before a UI change with a trace captured after the change.

```bash
deltaframe compare .deltaframe/traces/before-flow .deltaframe/traces/after-flow --focus "settings button spacing"
```

By default, DeltaFrame prints a Markdown verification summary. Use `--json` when an agent or script needs the structured comparison payload.

Options:

| Option | Default | Description |
| --- | ---: | --- |
| `--focus` | none | Area, state, or component to emphasize in the report. |
| `--expectation` | none | Expected visual outcome to include in the report. |
| `--json` | `false` | Print the full structured comparison JSON instead of Markdown. |
| `--fail-on-changes` | `false` | Exit non-zero if changed, added, removed, or annotation-changed states are found. |
| `--max-changed-states` | none | Exit non-zero if changed matched states exceed this number. |
| `--max-added-states` | none | Exit non-zero if added states exceed this number. |
| `--max-removed-states` | none | Exit non-zero if removed states exceed this number. |
| `--max-annotation-changes` | none | Exit non-zero if annotation changes exceed this number. |

## `mcp`

Start the DeltaFrame MCP stdio server.

```bash
deltaframe mcp --trace-root .deltaframe/traces
```

The MCP server writes only JSON-RPC messages to stdout. Diagnostics go to stderr.

MCP tools can capture a URL, find the latest trace, return a review command, list traces and states, fetch state images, compare states, compare before/after traces, and summarize traces. See [MCP.md](MCP.md) for tool schemas.

## `doctor`

Check local runtime dependencies.

```bash
deltaframe doctor
deltaframe doctor --browser
deltaframe doctor --desktop
```

It checks for:

- `playwright`
- `pixelmatch`
- `pngjs`

With `--browser`, it also tries to launch Chromium. On WSL/Ubuntu, a failed browser launch usually means system packages are missing:

```bash
sudo npx playwright install-deps chromium
```

With `--desktop`, it checks the optional Python `mss` backend and lists how many monitor sources are visible.
