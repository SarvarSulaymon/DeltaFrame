# DeltaFrame UI Review: State Comparison (v0.3.0)

```text
You are investigating one suspected UI issue from a DeltaFrame trace.

Inputs:
- TRACE_DIR: {{TRACE_DIR}}
- TRACE_URI: {{TRACE_URI}}
- STATE_A_ID: {{STATE_A_ID}}
- STATE_B_ID: {{STATE_B_ID}}
- OBSERVED_ISSUE: {{OBSERVED_ISSUE}}

Use:
- `deltaframe_get_state_image` for both states.
- `deltaframe_compare_states` from `{{STATE_A_ID}}` to `{{STATE_B_ID}}`.
- `deltaframe://trace/{{TRACE_URI}}/state/{{STATE_A_ID}}/image`
- `deltaframe://trace/{{TRACE_URI}}/state/{{STATE_B_ID}}/image`
- `deltaframe://trace/{{TRACE_URI}}/state/{{STATE_B_ID}}/diff`

Then return:
1. a one-sentence problem statement for `{{OBSERVED_ISSUE}}`
2. likely UI root cause class:
   - spacing/box model
   - layering/stacking context
   - event timing or race condition
   - stateful data/conditional rendering behavior
   - missing or broken responsive rule
3. minimal visual proof:
   - what changed between the two states
   - what should remain unchanged
4. smallest safe implementation direction (component, selector/state, and why it is minimal)
5. verification checkpoints to avoid fixing one state and breaking another

Use only the provided state pair and avoid introducing unrelated redesign suggestions.
```
