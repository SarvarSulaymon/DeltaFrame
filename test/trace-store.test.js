import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  compareTraces,
  createTraceDir,
  exportCuratedTrace,
  findLatestTraceDir,
  listTraceDirs,
  readCuration,
  readTrace,
  relativeTracePath,
  writeCuration,
  writeSummary,
  writeTrace
} from "../src/trace/store.js";

test("trace store creates, reads, summarizes, lists, and finds traces", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-trace-"));
  const firstDir = await createTraceDir({ outDir: root, name: "Landing Flow" });

  await writeTrace(firstDir, fixtureTrace({
    name: "Landing Flow",
    createdAt: "2026-06-06T10:00:00.000Z"
  }));
  await writeSummary(firstDir, await readTrace(firstDir));

  assert.equal(path.basename(firstDir).endsWith("-landing-flow"), true);
  assert.equal(await exists(path.join(firstDir, "frames")), true);
  assert.equal(await exists(path.join(firstDir, "diffs")), true);
  assert.equal(await exists(path.join(firstDir, "summary.md")), true);
  assert.deepEqual((await readTrace(firstDir)).states.map((state) => state.id), ["0001", "0002"]);
  assert.equal(relativeTracePath(firstDir, path.join(firstDir, "frames", "0001.png")), "frames/0001.png");

  const secondDir = await createTraceDir({ outDir: root, name: "Landing Flow" });
  await writeTrace(secondDir, fixtureTrace({
    name: "Landing Flow 2",
    createdAt: "2026-06-06T11:00:00.000Z"
  }));
  await fs.utimes(firstDir, new Date("2026-06-06T10:00:00.000Z"), new Date("2026-06-06T10:00:00.000Z"));
  await fs.utimes(secondDir, new Date("2026-06-06T11:00:00.000Z"), new Date("2026-06-06T11:00:00.000Z"));

  assert.notEqual(firstDir, secondDir);
  assert.equal(path.basename(secondDir).includes("-landing-flow"), true);
  assert.equal(await findLatestTraceDir(root), secondDir);
  assert.deepEqual((await listTraceDirs(root)).map((trace) => trace.name), [
    "Landing Flow 2",
    "Landing Flow"
  ]);
  assert.deepEqual(await listTraceDirs(path.join(root, "missing")), []);
});

test("trace store creates unique directories for concurrent captures", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-trace-race-"));
  const traceDirs = await Promise.all(Array.from({ length: 20 }, () => (
    createTraceDir({ outDir: root, name: "Landing Flow" })
  )));
  const uniqueTraceDirs = new Set(traceDirs);

  assert.equal(uniqueTraceDirs.size, traceDirs.length);
  assert.equal(traceDirs.every((traceDir) => path.basename(traceDir).includes("-landing-flow")), true);

  for (const traceDir of traceDirs) {
    assert.equal(await exists(path.join(traceDir, "frames")), true);
    assert.equal(await exists(path.join(traceDir, "diffs")), true);
  }
});

test("trace curation defaults to keep all states and persists ignored states", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-curation-"));
  const traceDir = await createTraceDir({ outDir: root, name: "Curation Flow" });
  const trace = fixtureTrace({
    name: "Curation Flow",
    createdAt: "2026-06-06T12:00:00.000Z"
  });
  await writeTrace(traceDir, trace);

  assert.deepEqual(await readCuration(traceDir), {
    version: 1,
    updatedAt: null,
    keptIds: ["0001", "0002"],
    ignoredIds: [],
    annotations: {},
    counts: { kept: 2, ignored: 0, total: 2 }
  });

  const curation = await writeCuration(traceDir, {
    ignoredIds: ["0002"],
    annotations: {
      "0001": "  Check header spacing.  ",
      "0002": { note: "Loading copy is confusing." },
      empty: "   "
    }
  });
  assert.equal(curation.counts.kept, 1);
  assert.deepEqual(curation.keptIds, ["0001"]);
  assert.deepEqual(curation.annotations, {
    "0001": "Check header spacing.",
    "0002": "Loading copy is confusing."
  });
  assert.deepEqual((await readCuration(traceDir)).ignoredIds, ["0002"]);

  await assert.rejects(
    writeCuration(traceDir, { ignoredIds: ["missing"] }),
    /Unknown state id/
  );
  await assert.rejects(
    writeCuration(traceDir, { annotations: { missing: "unknown" } }),
    /Unknown state id/
  );

  await writeCuration(traceDir, { ignoredIds: [] });
  assert.deepEqual((await readCuration(traceDir)).annotations, {
    "0001": "Check header spacing.",
    "0002": "Loading copy is confusing."
  });

  await fs.writeFile(
    path.join(traceDir, "curation.json"),
    `${JSON.stringify({
      states: { "0002": "ignored" },
      annotations: {
        "0001": { text: "Legacy note" },
        missing: "ignored"
      }
    }, null, 2)}\n`,
    "utf8"
  );
  const legacyCuration = await readCuration(traceDir);
  assert.deepEqual(legacyCuration.ignoredIds, ["0002"]);
  assert.deepEqual(legacyCuration.annotations, { "0001": "Legacy note" });
});

test("exportCuratedTrace writes a complete trace with only kept states", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-export-"));
  const traceDir = path.join(root, "source-trace");
  await fs.mkdir(path.join(traceDir, "frames"), { recursive: true });
  await fs.mkdir(path.join(traceDir, "diffs"), { recursive: true });
  await fs.writeFile(path.join(traceDir, "frames", "0001.png"), "one");
  await fs.writeFile(path.join(traceDir, "frames", "0002.png"), "two");
  await fs.writeFile(path.join(traceDir, "frames", "0003.png"), "three");
  await fs.writeFile(path.join(traceDir, "diffs", "0001-0002.png"), "diff-12");
  await fs.writeFile(path.join(traceDir, "diffs", "0002-0003.png"), "diff-23");
  await writeTrace(traceDir, fixtureTraceWithThreeStates());
  await writeCuration(traceDir, {
    ignoredIds: ["0002"],
    annotations: {
      "0001": "Keep this state as baseline.",
      "0002": "Ignore spinner flicker.",
      "0003": "Verify final layout."
    }
  });

  const result = await exportCuratedTrace(traceDir, {
    exportedAt: "2026-06-06T13:00:00.000Z"
  });
  const exported = await readTrace(result.traceDir);

  assert.deepEqual(exported.states.map((state) => state.id), ["0001", "0003"]);
  assert.equal(exported.states[1].diffFromPrevious, undefined);
  assert.equal(await exists(path.join(result.traceDir, "trace.json")), true);
  assert.equal(await exists(path.join(result.traceDir, "summary.md")), true);
  assert.equal(await exists(path.join(result.traceDir, "frames", "0001.png")), true);
  assert.equal(await exists(path.join(result.traceDir, "frames", "0003.png")), true);
  assert.equal(await exists(path.join(result.traceDir, "frames", "0002.png")), false);
  assert.equal(await exists(path.join(result.traceDir, "diffs", "0002-0003.png")), false);
  assert.match(
    await fs.readFile(path.join(result.traceDir, "summary.md"), "utf8"),
    /Annotation: Verify final layout\./
  );
  assert.deepEqual(exported.curation, {
    sourceTracePath: path.resolve(traceDir),
    exportedAt: "2026-06-06T13:00:00.000Z",
    keptIds: ["0001", "0003"],
    ignoredIds: ["0002"],
    annotations: {
      "0001": "Keep this state as baseline.",
      "0003": "Verify final layout."
    }
  });
});

test("exportCuratedTrace rejects referenced files outside the trace directory", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-export-path-"));
  const traceDir = path.join(root, "bad-trace");
  await fs.mkdir(path.join(traceDir, "frames"), { recursive: true });
  await fs.writeFile(path.join(root, "outside.png"), "outside");
  await writeTrace(traceDir, {
    ...fixtureTrace({
      name: "Bad Trace",
      createdAt: "2026-06-06T14:00:00.000Z"
    }),
    states: [
      {
        id: "0001",
        label: "bad",
        timestampMs: 0,
        url: "http://localhost:3000/",
        image: "../outside.png"
      }
    ]
  });

  await assert.rejects(
    exportCuratedTrace(traceDir),
    /state image must stay inside the trace directory/
  );
});

test("compareTraces summarizes before and after trace changes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-compare-"));
  const beforeDir = path.join(root, "before-trace");
  const afterDir = path.join(root, "after-trace");
  await fs.mkdir(path.join(beforeDir, "frames"), { recursive: true });
  await fs.mkdir(path.join(beforeDir, "diffs"), { recursive: true });
  await fs.mkdir(path.join(afterDir, "frames"), { recursive: true });
  await fs.mkdir(path.join(afterDir, "diffs"), { recursive: true });

  for (const file of [
    path.join(beforeDir, "frames", "0001.png"),
    path.join(beforeDir, "frames", "0002.png"),
    path.join(beforeDir, "diffs", "0001-0002.png"),
    path.join(afterDir, "frames", "0001.png"),
    path.join(afterDir, "frames", "0002.png"),
    path.join(afterDir, "frames", "0003.png"),
    path.join(afterDir, "diffs", "0001-0002.png"),
    path.join(afterDir, "diffs", "0002-0003.png")
  ]) {
    await fs.writeFile(file, "png");
  }

  const beforeTrace = fixtureTrace({
    name: "Before Flow",
    createdAt: "2026-06-06T15:00:00.000Z"
  });
  beforeTrace.states[1].route = "/settings";
  const afterTrace = fixtureTraceWithThreeStates();
  afterTrace.name = "After Flow";
  afterTrace.createdAt = "2026-06-06T15:10:00.000Z";
  afterTrace.states[1].route = "/settings";
  afterTrace.states[1].metrics = { ratio: 0.1 };
  afterTrace.states[2].route = "/settings/saved";

  await writeTrace(beforeDir, beforeTrace);
  await writeTrace(afterDir, afterTrace);
  await writeCuration(beforeDir, {
    annotations: { "0002": "Button spacing is too loose." }
  });
  await writeCuration(afterDir, {
    annotations: { "0002": "Button spacing is tightened." }
  });

  const comparison = await compareTraces(beforeDir, afterDir, {
    generatedAt: "2026-06-06T15:15:00.000Z",
    focus: "settings button spacing",
    expectation: "settings button spacing is tighter"
  });

  assert.equal(comparison.focus, "settings button spacing");
  assert.equal(comparison.expectation, "settings button spacing is tighter");
  assert.equal(comparison.counts.beforeStates, 2);
  assert.equal(comparison.counts.afterStates, 3);
  assert.equal(comparison.counts.matchedStates, 2);
  assert.equal(comparison.counts.changedStates, 1);
  assert.equal(comparison.counts.addedStates, 1);
  assert.equal(comparison.counts.removedStates, 0);
  assert.equal(comparison.counts.annotationChanges, 1);
  assert.equal(comparison.changedStates[0].before.id, "0002");
  assert.equal(comparison.changedStates[0].before.imagePresent, true);
  assert.equal(comparison.changedStates[0].after.changedRatio, 0.1);
  assert.deepEqual(
    comparison.changedStates[0].changes.map((change) => change.field),
    ["changedRatio", "annotation"]
  );
  assert.equal(comparison.addedStates[0].id, "0003");
  assert.match(comparison.markdown, /Before\/After Verification/);
  assert.match(comparison.markdown, /settings button spacing/);
  assert.match(comparison.markdown, /Added States/);
});

function fixtureTrace({ name, createdAt }) {
  return {
    version: 1,
    name,
    createdAt,
    source: {
      type: "url",
      url: "http://localhost:3000",
      finalUrl: "http://localhost:3000/",
      viewport: { width: 800, height: 600 },
      fullPage: false
    },
    settings: {},
    states: [
      {
        id: "0001",
        label: "initial",
        timestampMs: 0,
        url: "http://localhost:3000/",
        image: "frames/0001.png"
      },
      {
        id: "0002",
        label: "changed",
        timestampMs: 120,
        url: "http://localhost:3000/",
        image: "frames/0002.png",
        diffFromPrevious: "diffs/0001-0002.png",
        metrics: { ratio: 0.25 }
      }
    ]
  };
}

function fixtureTraceWithThreeStates() {
  const trace = fixtureTrace({
    name: "Export Flow",
    createdAt: "2026-06-06T12:30:00.000Z"
  });
  trace.states.push({
    id: "0003",
    label: "final",
    timestampMs: 240,
    url: "http://localhost:3000/",
    image: "frames/0003.png",
    diffFromPrevious: "diffs/0002-0003.png",
    metrics: { ratio: 0.1 }
  });
  return trace;
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
