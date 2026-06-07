---
name: deltaframe
description: Use when a user wants Codex to inspect DeltaFrame visual traces, compare UI states, or use captured screenshots to guide frontend/design changes.
---

# DeltaFrame

Use DeltaFrame when the user has captured a visual trace with `deltaframe watch` and wants help improving a prototype from the captured UI states.

Core product understanding: DeltaFrame is meant to be a visual memory condenser for Codex. The default loop is dense capture, noise removal, keyframe selection, then Codex inspection. Do not treat raw pixel diffs as the product.

## Workflow

1. Prefer the DeltaFrame MCP tools when the `deltaframe` MCP server is available.
2. If the user gives a URL to inspect, use `deltaframe_capture_url` with a short positive `durationMs`; raw capture and keyframe distillation are the default.
3. If the trace directory is not obvious, use `deltaframe_latest_trace`.
4. Start review with `deltaframe_summarize_trace` or `deltaframe_list_states`.
5. If you need MCP resource-oriented access, read:
   - `deltaframe://trace/{encodedTraceDir}/summary`
   - `deltaframe://trace/{encodedTraceDir}/states`
   - `deltaframe://trace/{encodedTraceDir}/state/{stateId}`
   - `deltaframe://trace/{encodedTraceDir}/state/{stateId}/image`
6. Inspect only the state images needed to understand the UI issue.
7. Compare adjacent states when the issue is a layout shift, transition, modal, validation, hover, loading, or responsive breakpoint.
8. Use `deltaframe_review_trace` when a human-readable local review UI would help; run the returned command outside MCP.
9. Make focused code changes, recapture when visual verification is needed, then use `deltaframe_compare_traces` to compare the before and after traces.

## UI Review Prompt Templates

When the user asks for a UI review from a DeltaFrame trace, pick one of these templates and follow the template order:

- `plugins/deltaframe-codex/skills/deltaframe/prompts/0.3.0/ui-review-triage.prompt.md`
  - `Trace triage`: identify and prioritize candidate issues and suspicious state transitions.
- `plugins/deltaframe-codex/skills/deltaframe/prompts/0.3.0/ui-review-state-comparison.prompt.md`
  - `State comparison`: drill into a specific issue, compare two states, and isolate likely UI causes.
- `plugins/deltaframe-codex/skills/deltaframe/prompts/0.3.0/ui-review-implementation-brief.prompt.md`
  - `Implementation brief`: generate a minimal, testable code change plan from the chosen findings.
- `plugins/deltaframe-codex/skills/deltaframe/prompts/0.3.0/ui-review-verification.prompt.md`
  - `Before/after verification`: confirm changes with an explicit recapture + comparison pass.

See [docs/UI_REVIEW_PROMPTS.md](../../../../docs/UI_REVIEW_PROMPTS.md) for file-by-file placeholder guidance.

## Local CLI Fallback

If MCP tools are not available, use the local CLI:

```bash
deltaframe watch --url <url> --duration 10000
deltaframe summarize <trace-dir>
deltaframe compare <before-trace-dir> <after-trace-dir>
deltaframe review <trace-dir>
```

The trace folder contains:

```text
trace.json
summary.md
frames/
raw/
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
