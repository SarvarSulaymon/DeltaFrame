---
name: deltaframe
description: Use when a user wants Codex to inspect DeltaFrame visual traces, compare UI states, or use captured screenshots to guide frontend/design changes.
---

# DeltaFrame

Use DeltaFrame when the user has captured a visual trace with `deltaframe watch` and wants help improving a prototype from the captured UI states.

## Workflow

1. Ask for the trace directory if it is not obvious from the repository.
2. Prefer the DeltaFrame MCP tools when the `deltaframe` MCP server is available.
3. Start with `deltaframe_summarize_trace` or `deltaframe_list_states`.
4. Inspect only the state images needed to understand the UI issue.
5. Compare adjacent states when the issue is a layout shift, transition, modal, validation, hover, loading, or responsive breakpoint.
6. Make focused code changes.
7. Ask the user to recapture or run DeltaFrame again when visual verification is needed.

## Local CLI Fallback

If MCP tools are not available, use the local CLI:

```bash
deltaframe summarize <trace-dir>
deltaframe review <trace-dir>
```

The trace folder contains:

```text
trace.json
summary.md
frames/
diffs/
```

## Review Stance

Look for:

- states that reveal layout shifts
- elements that overlap or overflow
- modal, drawer, popover, and tooltip placement issues
- loading or error states that are visually confusing
- changes that fix one state but damage another

Keep edits scoped to the UI behavior shown in the trace.
