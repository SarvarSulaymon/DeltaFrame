import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createTraceDir,
  findLatestTraceDir,
  listTraceDirs,
  readTrace,
  relativeTracePath,
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

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
