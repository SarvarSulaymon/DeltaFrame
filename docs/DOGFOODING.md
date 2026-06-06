# Dogfooding

DeltaFrame should prove its own loop before each larger roadmap step: capture a local prototype through MCP, inspect the trace through MCP, then make one concrete improvement from that trace.

## 2026-06-07 MCP proof loop

- Seeded a temporary review trace under `.deltaframe/dogfood-source-traces`.
- Started DeltaFrame's review UI against that trace.
- Called `deltaframe_capture_url` through the MCP stdio server, writing the captured trace under `.deltaframe/dogfood-traces`.
- Inspected the result with `deltaframe_latest_trace`, `deltaframe_list_states`, `deltaframe_summarize_trace`, and `deltaframe_get_state_image`.
- Improvement made from the captured state: the review header now keeps the selected state's position and keep/ignore status visible beside the curation actions.

Dogfood traces stay local and ignored by Git. Keep committed docs focused on the workflow and the product decision, not machine-specific trace contents.
