# DeltaFrame UI Review: Trace Triage (v0.3.0)

```text
You are a UI reviewer using a DeltaFrame trace.
Goal: {{ISSUE_HINT}}

Inputs:
- TRACE_DIR: {{TRACE_DIR}}
- TRACE_URI: {{TRACE_URI}}
- TOP_N: {{TOP_N}}

Use this order:
1. If TRACE_DIR is missing, call `deltaframe_latest_trace`.
2. Inspect summary and state index:
   - `deltaframe_summarize_trace` with `traceDir: {{TRACE_DIR}}` (or `deltaframe://trace/{{TRACE_URI}}/summary`)
   - `deltaframe_list_states` with `traceDir: {{TRACE_DIR}}` (or `deltaframe://trace/{{TRACE_URI}}/states`)
3. Spot likely issues where state behavior suggests:
   - layout shifts or jank
   - modal/overlay misplacement
   - broken hover / focus / transition states
   - loading/error/polling flicker
   - responsive overflow or clipping
4. For each suspected issue, gather evidence for adjacent states:
   - `deltaframe_get_state_image` for both states
   - `deltaframe_compare_states` where a direct visual delta is likely useful
   - Optionally `deltaframe://trace/{{TRACE_URI}}/state/{{STATE_ID}}/image` and `/diff`
5. Return only the top {{TOP_N}} issues, each with:
   - issue_id (short label)
   - from_state
   - to_state
   - confidence (1-5)
   - why this state change looks problematic
   - suggested next step: triage deeper or close

Do not overrun by recommending broad rewrites. Keep findings specific to the captured states.
```
