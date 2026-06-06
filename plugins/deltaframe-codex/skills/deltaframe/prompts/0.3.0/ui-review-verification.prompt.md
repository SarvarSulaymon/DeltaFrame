# DeltaFrame UI Review: Before/After Verification (v0.3.0)

```text
You are running a strict visual verification loop after implementing UI changes.

Inputs:
- TRACE_DIR: {{TRACE_DIR}}
- TRACE_URI: {{TRACE_URI}}
- URL: {{URL}}
- CHANGE_SUMMARY: {{CHANGE_SUMMARY}}
- EXPECTATIONS: {{EXPECTATIONS}}

1. Capture a fresh trace after the change (or confirm one was captured) with
   `deltaframe_capture_url` and `durationMs` short enough for the interaction.
2. Verify expected visual outcomes:
   - `deltaframe_compare_traces` with the before trace, after trace, focus, and expectation
   - `deltaframe_summarize_trace` on the new trace
   - `deltaframe_list_states` if the comparison report needs state-level follow-up
   - `deltaframe_compare_states` for each expected fix pair that needs pixel-level proof
   - `deltaframe://trace/{encodedTraceDir}/state/{stateId}/diff` for visual proof
3. Compare the before-trace states for regression risk:
   - unchanged states should remain stable
   - high-impact states should only change when expected
4. For each expectation in `{{EXPECTATIONS}}`, output:
   - PASS / FAIL
   - supporting evidence (`stateId` or diff id)
   - next action if failed (re-fix, adjust scope, or capture again)

Keep this loop compact: do not expand into broad QA; only validate what was changed and list the highest-risk neighboring states.
```
