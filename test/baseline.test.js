import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluateTraceComparison } from "../src/trace/baseline.js";
import { attachDeltaFrameTrace, attachDeltaFrameTraceOnFailure } from "../src/integrations/playwrightTest.js";

test("evaluateTraceComparison reports budget failures", () => {
  const comparison = {
    counts: {
      changedStates: 2,
      addedStates: 1,
      removedStates: 0,
      annotationChanges: 1
    }
  };

  const result = evaluateTraceComparison(comparison, {
    changedStates: 1,
    addedStates: 1,
    removedStates: 0,
    annotationChanges: 0
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.failures.map((failure) => failure.field), [
    "changedStates",
    "annotationChanges"
  ]);
});

test("attachDeltaFrameTrace attaches summary and trace json when available", async () => {
  const traceDir = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-attach-"));
  await fs.writeFile(path.join(traceDir, "summary.md"), "# Trace\n", "utf8");
  await fs.writeFile(path.join(traceDir, "trace.json"), "{}\n", "utf8");
  const attachments = [];
  const testInfo = {
    async attach(name, payload) {
      attachments.push({ name, payload });
    }
  };

  assert.equal(await attachDeltaFrameTrace(testInfo, traceDir, { name: "ui" }), true);
  assert.deepEqual(attachments.map((attachment) => attachment.name), [
    "ui-trace-dir",
    "ui-summary",
    "ui-trace-json"
  ]);
  assert.equal(attachments[0].payload.contentType, "text/plain");
});

test("attachDeltaFrameTraceOnFailure skips expected passing tests", async () => {
  const testInfo = {
    status: "passed",
    expectedStatus: "passed",
    async attach() {
      throw new Error("should not attach");
    }
  };

  assert.equal(await attachDeltaFrameTraceOnFailure(testInfo, "missing"), false);
});
