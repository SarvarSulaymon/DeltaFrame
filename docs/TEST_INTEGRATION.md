# Test Integration

DeltaFrame can be used in automated UI checks without turning into a full visual regression platform.

## Scripted Flow Capture

Use `deltaframe flow` when you want a repeatable Playwright script to produce a trace:

```bash
deltaframe flow --url http://localhost:3000 --script ./flows/onboarding.js --name onboarding
```

Example flow module:

```js
export default async function ({ page, capture }) {
  await capture("landing");
  await page.getByRole("button", { name: "Get Started" }).click();
  await capture("after get started");
}
```

DeltaFrame captures `initial` and `final` automatically. On failure it attempts a `failure` capture, writes the trace, prints the trace path, and exits non-zero.

## Failed-Test Attachments

For Playwright Test, attach trace metadata when a test fails:

```js
import { test } from "@playwright/test";
import { attachDeltaFrameTraceOnFailure } from "../src/integrations/playwrightTest.js";

test("checkout", async ({ page }, testInfo) => {
  let traceDir;
  try {
    // Run your app flow and set traceDir to a DeltaFrame trace folder.
  } finally {
    if (traceDir) {
      await attachDeltaFrameTraceOnFailure(testInfo, traceDir, { name: "checkout" });
    }
  }
});
```

The helper attaches the trace directory path, `summary.md`, and `trace.json` when available. It does not upload images by itself.

## Baseline Comparison

Compare an actual trace against a baseline trace and fail CI when the change budget is exceeded:

```bash
deltaframe compare .deltaframe/baselines/checkout .deltaframe/traces/checkout --fail-on-changes
```

For less strict budgets:

```bash
deltaframe compare .deltaframe/baselines/checkout .deltaframe/traces/checkout \
  --max-changed-states 1 \
  --max-added-states 0 \
  --max-removed-states 0
```

`deltaframe compare` is non-interactive and exits with code `1` when a configured budget fails.

## CI Notes

- Use `deltaframe watch --no-controls` for non-interactive web captures.
- Use `deltaframe flow` for repeatable scripted captures.
- Keep traces as CI artifacts only when they are safe to share.
- Prefer `--redact` for private screen areas before traces are written.
- Browser capture in CI still needs Playwright browser installation and Linux packages.
