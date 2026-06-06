# UI Review Prompt Templates (v0.3.0)

DeltaFrame includes a small prompt pack for UI review workflows that pairs with MCP tools and resources.

Template location:

`plugins/deltaframe-codex/skills/deltaframe/prompts/0.3.0/`

Use these templates when a user asks to review a UI from a DeltaFrame trace. The set is intentionally narrow:

1. trace triage
2. state comparison
3. implementation brief
4. before/after verification

## 1) Trace triage

- File: `ui-review-triage.prompt.md`
- Use when: you have a full trace and need to quickly identify likely visual issues.
- Inputs:
  - `{{TRACE_DIR}}`: local trace path like `.deltaframe/traces/2026-06-07-flow`
  - `{{TRACE_URI}}`: URL-encoded trace path for resources
  - `{{ISSUE_HINT}}`: user goal or problem statement
  - `{{TOP_N}}`: number of findings to surface

Use `deltaframe_summarize_trace`, `deltaframe_list_states`, and the MCP resources:

- `deltaframe://trace/{{TRACE_URI}}/summary`
- `deltaframe://trace/{{TRACE_URI}}/states`

## 2) State comparison

- File: `ui-review-state-comparison.prompt.md`
- Use when: one candidate issue needs root-cause analysis.
- Inputs:
  - `{{TRACE_DIR}}`, `{{TRACE_URI}}`
  - `{{STATE_A_ID}}`, `{{STATE_B_ID}}`
  - `{{OBSERVED_ISSUE}}`

Use `deltaframe_get_state_image`, `deltaframe_compare_states`, and optionally:

- `deltaframe://trace/{{TRACE_URI}}/state/{{STATE_A_ID}}`
- `deltaframe://trace/{{TRACE_URI}}/state/{{STATE_B_ID}}`
- `deltaframe://trace/{{TRACE_URI}}/state/{{STATE_A_ID}}/image`
- `deltaframe://trace/{{TRACE_URI}}/state/{{STATE_B_ID}}/image`
- `deltaframe://trace/{{TRACE_URI}}/state/{{STATE_B_ID}}/diff`

## 3) Implementation brief

- File: `ui-review-implementation-brief.prompt.md`
- Use when: you have prioritized issues and are ready to produce scoped UI edits.
- Inputs:
  - `{{TRACE_DIR}}`, `{{TRACE_URI}}`
  - `{{TARGET_ISSUE_ID}}`
  - `{{ISSUE_SUMMARY}}`
  - `{{CONSTRAINTS}}`: budget, files to avoid, accessibility requirements

Use `deltaframe_get_state_image` and `deltaframe_compare_states` as needed for evidence.

## 4) Before/after verification

- File: `ui-review-verification.prompt.md`
- Use when: code changes are made and you want a tight visual verification cycle.
- Inputs:
  - `{{TRACE_DIR}}`
  - `{{TRACE_URI}}`
  - `{{URL}}`
  - `{{CHANGE_SUMMARY}}`
  - `{{EXPECTATIONS}}`: expected visual improvements and regressions to check

Use `deltaframe_capture_url` (or existing workflow) to get a fresh post-change trace and compare with prior:

- `deltaframe://trace/{encodedTraceDir}/state/{{STATE_ID}}/image`
- `deltaframe://trace/{encodedTraceDir}/state/{{STATE_ID}}/diff`

## Placeholder conventions

- `{{TRACE_DIR}}` is the local trace directory for tool calls.
- `{{TRACE_URI}}` is `encodeURIComponent({{TRACE_DIR}})` for resource URIs.
- `{{STATE_*_ID}}` values come from `deltaframe://trace/{encodedTraceDir}/states` and should be short IDs like `0002`.

Prefer filling every placeholder before running a template. If something is missing, state that assumption explicitly and proceed with the best available trace context.
