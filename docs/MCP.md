# MCP Integration

DeltaFrame includes a local MCP stdio server so Codex can inspect captured visual traces without manually pasting every screenshot.

Product intent: MCP should eventually expose selected keyframes from a dense capture as the primary Codex input. The current tools expose sparse saved states from the existing trace format.

## Start The Server

From a source checkout, run the MCP server through Node:

```bash
node ./bin/deltaframe.js mcp --trace-root .deltaframe/traces
```

If you have run `npm link` or installed the package globally, the linked CLI works too:

```bash
deltaframe mcp --trace-root .deltaframe/traces
```

MCP clients usually launch this command for you from their config.

## Codex Config Example

For a local checkout, add an MCP server entry that points at the DeltaFrame CLI.

```toml
[mcp_servers.deltaframe]
command = "node"
args = [
  "C:/Users/acer/Documents/DeltaFrame/bin/deltaframe.js",
  "mcp",
  "--trace-root",
  "C:/Users/acer/Documents/DeltaFrame/.deltaframe/traces"
]
```

If DeltaFrame is installed globally or available through `npx`, use:

```toml
[mcp_servers.deltaframe]
command = "deltaframe"
args = ["mcp", "--trace-root", ".deltaframe/traces"]
```

Restart Codex after changing MCP configuration.

## Resources

DeltaFrame exposes captured traces as MCP resources. The encoded trace directory is the result of `encodeURIComponent(traceDir)`.

Resource URIs:

- `deltaframe://trace/<encoded-trace-dir>` returns the full `trace.json` as `application/json`.
- `deltaframe://trace/<encoded-trace-dir>/summary` returns a Markdown trace summary as `text/markdown`.
- `deltaframe://trace/<encoded-trace-dir>/states` returns a compact state index as `application/json`.
- `deltaframe://trace/<encoded-trace-dir>/state/<stateId>` returns one state's JSON metadata as `application/json`.
- `deltaframe://trace/<encoded-trace-dir>/state/<stateId>/image` returns that state's PNG screenshot as a base64 `blob` with `mimeType: "image/png"`.
- `deltaframe://trace/<encoded-trace-dir>/state/<stateId>/diff` returns the previous-state diff PNG as a base64 `blob` with `mimeType: "image/png"` when the trace has one.

`resources/list` lists the full trace JSON, summary, and compact state index for each available trace. It intentionally does not enumerate every per-state image for large traces; discover per-state JSON, image, and diff URIs through `resources/templates/list` and the `/states` index.

`resources/templates/list` advertises these templates:

```text
deltaframe://trace/{encodedTraceDir}
deltaframe://trace/{encodedTraceDir}/summary
deltaframe://trace/{encodedTraceDir}/states
deltaframe://trace/{encodedTraceDir}/state/{stateId}
deltaframe://trace/{encodedTraceDir}/state/{stateId}/image
deltaframe://trace/{encodedTraceDir}/state/{stateId}/diff
```

Trace summaries, state indexes, and per-state JSON include human annotations from `curation.json` when present. All resource reads are constrained to the configured trace root, and image/diff files must remain inside the resolved trace directory.

## Tools

### `deltaframe_capture_url`

Captures meaningful visual state changes from a URL and writes a new trace.

Default implementation captures a dense raw timeline, then exposes selected keyframes. Set `rawFrames` to `false` only when you intentionally want sparse changed-state capture.

Input:

```json
{
  "url": "http://localhost:3000",
  "name": "landing-flow",
  "durationMs": 10000,
  "intervalMs": 100,
  "fps": 10,
  "rawFrames": true,
  "idleMs": 0,
  "minChangedRatio": 0.003,
  "pixelThreshold": 0.12,
  "masks": [
    { "x": 0, "y": 0, "width": 160, "height": 40, "label": "clock" }
  ],
  "maxFrames": 80,
  "viewport": "1440x900",
  "fullPage": false,
  "headed": false,
  "channel": "chrome",
  "outDir": ".deltaframe/traces"
}
```

Only `url` is required. The MCP capture call must use a positive `durationMs`; use the CLI `watch --duration 0` form for interactive captures that run until Ctrl+C.

`masks` may be an array of `{ "x", "y", "width", "height", "label" }` rectangles or a JSON string containing that array. Masks are applied only while diffing; saved screenshots remain unmasked. Captures record normalized masks in `trace.json` under `settings.masks`.

By default, raw frames are written under `raw/` and listed in `trace.rawFrames`; selected state images still live under `frames/`.

`deltaframe_list_states`, state resources, and image resources expose the selected keyframes, not every raw frame. Each selected state includes `keyframe.rawFrameId`, `keyframe.selectionReasons`, and `keyframe.skippedRawFrameCount` when available.

Returns JSON text with:

- `traceDir`
- `stateCount`
- `rawFrameCount`
- `summary`
- `metadata`

### `deltaframe_latest_trace`

Returns the newest trace directory and summary metadata.

Input:

```json
{
  "traceRoot": ".deltaframe/traces"
}
```

### `deltaframe_review_trace`

Returns the exact local command to run the review UI and the expected local URL. It does not start the long-running review server inside the MCP request.

Input:

```json
{
  "traceDir": ".deltaframe/traces/2026-06-06-landing-flow",
  "port": 7799
}
```

### `deltaframe_list_traces`

Lists available traces.

Input:

```json
{
  "traceRoot": ".deltaframe/traces"
}
```

### `deltaframe_list_states`

Lists visual states in a trace. Defaults to the latest trace.

Input:

```json
{
  "traceDir": ".deltaframe/traces/2026-06-06-landing-flow"
}
```

### `deltaframe_get_state_image`

Returns a saved state image as PNG content.

Input:

```json
{
  "traceDir": ".deltaframe/traces/2026-06-06-landing-flow",
  "stateId": "0002"
}
```

### `deltaframe_compare_states`

Returns a PNG diff between two states.

Input:

```json
{
  "traceDir": ".deltaframe/traces/2026-06-06-landing-flow",
  "fromStateId": "0001",
  "toStateId": "0002"
}
```

### `deltaframe_compare_traces`

Compares a trace captured before a UI change with a trace captured after the change. The result is metadata-first and deterministic: it matches states by stable signals, reports changed/added/removed states, includes annotation changes, and returns a Markdown verification summary for agents.

Input:

```json
{
  "beforeTraceDir": ".deltaframe/traces/before-flow",
  "afterTraceDir": ".deltaframe/traces/after-flow",
  "focus": "settings button spacing",
  "expectation": "settings spacing is tighter without new overlap"
}
```

Returns JSON text with:

- `before` and `after` trace metadata
- `counts`
- `matchedStates`
- `changedStates`
- `addedStates`
- `removedStates`
- `markdown`

### `deltaframe_summarize_trace`

Returns a compact text summary of the trace.

Input:

```json
{
  "traceDir": ".deltaframe/traces/2026-06-06-landing-flow"
}
```

## Suggested Codex Prompt

```text
Use DeltaFrame to capture http://localhost:3000 for 10 seconds, inspect the resulting trace, identify visual state changes that suggest layout, interaction, or polish issues, then make the smallest code changes needed and verify the affected state again.
```

## Notes

- The server is local-first and reads/writes trace files on disk.
- It does not upload screenshots.
- It returns images only when the MCP client asks for them.
- The MCP server writes only JSON-RPC messages to stdout. Diagnostics and capture logs must go to stderr.
- `deltaframe_review_trace` returns a command instead of blocking forever with a review server.
- Keep sensitive traces out of shared folders.
