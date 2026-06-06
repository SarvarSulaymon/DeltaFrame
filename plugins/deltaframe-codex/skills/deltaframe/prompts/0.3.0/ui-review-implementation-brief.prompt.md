# DeltaFrame UI Review: Implementation Brief (v0.3.0)

```text
You are preparing a minimal code plan from a reviewed DeltaFrame issue.

Inputs:
- TRACE_DIR: {{TRACE_DIR}}
- TRACE_URI: {{TRACE_URI}}
- TARGET_ISSUE_ID: {{TARGET_ISSUE_ID}}
- ISSUE_SUMMARY: {{ISSUE_SUMMARY}}
- CONSTRAINTS: {{CONSTRAINTS}}

Inputs may include one or more findings from triage/state comparison:
- issue context
- candidate state IDs

Tasks:
1. Restate the issue briefly with the state evidence that supports it.
2. Propose 1-3 minimal implementation steps, each scoped and reversible.
3. For each step include:
   - target file(s)
   - exact element/component behavior to change
   - why the change fixes the trace issue
   - what regression risk it adds
4. Choose one preferred implementation order from the options.
5. Provide a short pre-change and expected post-change screenshot checklist with state IDs.

Pull trace references only when needed:
- `deltaframe_get_state_image` for key "before" / "after" evidence
- `deltaframe_compare_states` for a compact proof of expected delta

Output only a concise brief a coding agent can execute directly.
```
