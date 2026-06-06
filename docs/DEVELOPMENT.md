# Development

DeltaFrame is currently a plain Node.js ESM project with no build step.

## Setup

```bash
npm install
npx playwright install chromium
```

On WSL/Ubuntu, install Chromium's system libraries too:

```bash
sudo npx playwright install-deps chromium
```

## Commands

```bash
node ./bin/deltaframe.js --help
node ./bin/deltaframe.js doctor
node ./bin/deltaframe.js doctor --browser
node ./bin/deltaframe.js watch --url http://localhost:3000 --headed
node ./bin/deltaframe.js review
```

## Local Fixture

You can capture any local dev server. For quick manual testing, create a tiny HTML page and serve it with your preferred static server, then run:

```bash
node ./bin/deltaframe.js watch --url http://localhost:8080 --name fixture --headed
```

## Dependency Loading

The source imports packages normally. It also supports runtime-provided `NODE_PATH` or `DELTAFRAME_NODE_MODULES` directories for development environments that already bundle dependencies.

## Coding Rules

- Keep trace data file-based and inspectable.
- Keep MCP stdout clean: only JSON-RPC messages may be written to stdout.
- Send diagnostics to stderr.
- Do not add cloud upload behavior to the core path.
- Prefer small, explainable capture heuristics before adding machine learning.
