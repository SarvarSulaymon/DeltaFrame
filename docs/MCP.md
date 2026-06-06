# MCP Integration

DeltaFrame includes a local MCP stdio server so Codex can inspect captured visual traces without manually pasting every screenshot.

## Start The Server

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

## Tools

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
Use DeltaFrame to inspect the latest trace. Identify visual state changes that suggest layout, interaction, or polish issues. Then make the smallest code changes needed and verify the affected state again.
```

## Notes

- The server is local-first and reads trace files from disk.
- It does not upload screenshots.
- It returns images only when the MCP client asks for them.
- Keep sensitive traces out of shared folders.
