import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import test from "node:test";

test("MCP initialize and tools/list advertise DeltaFrame tools", async () => {
  const traceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-mcp-"));
  const client = startMcpClient(traceRoot);

  const initialize = await client.request({
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "deltaframe-test", version: "0.0.0" }
    }
  });
  const toolsList = await client.request({ method: "tools/list" });
  client.close();

  assert.equal(initialize.result.serverInfo.name, "deltaframe");
  assert.equal(initialize.result.capabilities.tools.constructor, Object);

  const toolNames = toolsList.result.tools.map((tool) => tool.name);
  assert.equal(toolNames.includes("deltaframe_capture_url"), true);
  assert.equal(toolNames.includes("deltaframe_latest_trace"), true);
  assert.equal(toolNames.includes("deltaframe_review_trace"), true);
  assert.equal(toolNames.includes("deltaframe_compare_traces"), true);
  assert.equal(client.stderr.join(""), "");
});

test("MCP deltaframe_compare_traces returns a structured before/after report", async () => {
  const traceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-mcp-compare-"));
  const beforeTraceDir = await writeFixtureTrace(traceRoot, {
    dirName: "before-trace",
    name: "Before Trace"
  });
  const afterTraceDir = await writeFixtureTrace(traceRoot, {
    dirName: "after-trace",
    name: "After Trace",
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
        route: "/settings",
        timestampMs: 500,
        url: "http://localhost:3000/settings",
        image: "frames/0002.png",
        diffFromPrevious: "diffs/0002.png",
        metrics: { ratio: 0.05 }
      },
      {
        id: "0003",
        label: "saved",
        route: "/settings/saved",
        timestampMs: 900,
        url: "http://localhost:3000/settings/saved",
        image: "frames/0003.png",
        diffFromPrevious: "diffs/0003.png",
        metrics: { ratio: 0.02 }
      }
    ],
    curation: {
      version: 1,
      updatedAt: "2026-06-07T08:05:00.000Z",
      ignoredIds: [],
      annotations: {
        "0002": "Spacing is improved."
      }
    }
  });
  const client = startMcpClient(traceRoot);

  try {
    const response = await client.request({
      method: "tools/call",
      params: {
        name: "deltaframe_compare_traces",
        arguments: {
          beforeTraceDir,
          afterTraceDir,
          focus: "settings spacing",
          expectation: "spacing is improved"
        }
      }
    });
    const comparison = JSON.parse(response.result.content[0].text);

    assert.equal(comparison.focus, "settings spacing");
    assert.equal(comparison.expectation, "spacing is improved");
    assert.equal(comparison.counts.beforeStates, 2);
    assert.equal(comparison.counts.afterStates, 3);
    assert.equal(comparison.counts.matchedStates, 2);
    assert.equal(comparison.counts.changedStates, 1);
    assert.equal(comparison.counts.addedStates, 1);
    assert.equal(comparison.changedStates[0].changes.some((change) => change.field === "changedRatio"), true);
    assert.match(comparison.markdown, /Before\/After Verification/);
  } finally {
    client.close();
  }
});

test("MCP resources/list includes trace summary and state index resources", async () => {
  const traceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-mcp-resources-"));
  const traceDir = await writeFixtureTrace(traceRoot);
  const baseUri = traceResourceBase(traceDir);
  const client = startMcpClient(traceRoot);

  try {
    const response = await client.request({ method: "resources/list" });
    const resources = response.result.resources;
    const uris = resources.map((resource) => resource.uri);

    assert.equal(uris.includes(baseUri), true);
    assert.equal(uris.includes(`${baseUri}/summary`), true);
    assert.equal(uris.includes(`${baseUri}/states`), true);
    assert.equal(resources.find((resource) => resource.uri === `${baseUri}/summary`).mimeType, "text/markdown");
    assert.equal(resources.find((resource) => resource.uri === `${baseUri}/states`).mimeType, "application/json");
  } finally {
    client.close();
  }
});

test("MCP resources/templates/list advertises DeltaFrame resource URI patterns", async () => {
  const traceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-mcp-templates-"));
  const client = startMcpClient(traceRoot);

  try {
    const response = await client.request({ method: "resources/templates/list" });
    const templates = response.result.resourceTemplates.map((template) => template.uriTemplate);

    assert.equal(templates.includes("deltaframe://trace/{encodedTraceDir}"), true);
    assert.equal(templates.includes("deltaframe://trace/{encodedTraceDir}/summary"), true);
    assert.equal(templates.includes("deltaframe://trace/{encodedTraceDir}/states"), true);
    assert.equal(templates.includes("deltaframe://trace/{encodedTraceDir}/state/{stateId}"), true);
    assert.equal(templates.includes("deltaframe://trace/{encodedTraceDir}/state/{stateId}/image"), true);
    assert.equal(templates.includes("deltaframe://trace/{encodedTraceDir}/state/{stateId}/diff"), true);
  } finally {
    client.close();
  }
});

test("MCP resources/read returns summary, states, per-state JSON, and image blobs", async () => {
  const traceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-mcp-read-resources-"));
  const traceDir = await writeFixtureTrace(traceRoot);
  const baseUri = traceResourceBase(traceDir);
  const client = startMcpClient(traceRoot);

  try {
    const fullTrace = await client.request({
      method: "resources/read",
      params: { uri: baseUri }
    });
    assert.equal(fullTrace.result.contents[0].mimeType, "application/json");
    assert.equal(JSON.parse(fullTrace.result.contents[0].text).states.length, 2);

    const summary = await client.request({
      method: "resources/read",
      params: { uri: `${baseUri}/summary` }
    });
    assert.equal(summary.result.contents[0].mimeType, "text/markdown");
    assert.match(summary.result.contents[0].text, /# Fixture Trace/);
    assert.match(summary.result.contents[0].text, /0002 changed/);
    assert.match(summary.result.contents[0].text, /Annotation: Human note for Codex/);

    const states = await client.request({
      method: "resources/read",
      params: { uri: `${baseUri}/states` }
    });
    const stateIndex = JSON.parse(states.result.contents[0].text);
    assert.equal(states.result.contents[0].mimeType, "application/json");
    assert.equal(stateIndex.stateCount, 2);
    assert.equal(stateIndex.annotationCount, 1);
    assert.equal(stateIndex.states[1].annotation, "Human note for Codex");
    assert.deepEqual(stateIndex.states[1].keyframe, {
      rawFrameId: "raw-000003",
      selectionReasons: ["visual-change"],
      skippedRawFrameCount: 1
    });
    assert.equal(stateIndex.states[1].resources.image, `${baseUri}/state/0002/image`);
    assert.equal(stateIndex.states[1].resources.diff, `${baseUri}/state/0002/diff`);

    const state = await client.request({
      method: "resources/read",
      params: { uri: `${baseUri}/state/0002` }
    });
    const stateDetails = JSON.parse(state.result.contents[0].text);
    assert.equal(stateDetails.state.id, "0002");
    assert.deepEqual(stateDetails.state.keyframe.selectionReasons, ["visual-change"]);
    assert.equal(stateDetails.annotation, "Human note for Codex");
    assert.equal(stateDetails.resources.diff, `${baseUri}/state/0002/diff`);

    const image = await client.request({
      method: "resources/read",
      params: { uri: `${baseUri}/state/0002/image` }
    });
    assert.equal(image.result.contents[0].mimeType, "image/png");
    assert.equal(image.result.contents[0].blob, FIXTURE_PNG_BASE64);

    const diff = await client.request({
      method: "resources/read",
      params: { uri: `${baseUri}/state/0002/diff` }
    });
    assert.equal(diff.result.contents[0].mimeType, "image/png");
    assert.equal(diff.result.contents[0].blob, FIXTURE_PNG_BASE64);
  } finally {
    client.close();
  }
});

test("MCP rejects trace paths, resources, and capture output outside trace root", async () => {
  const traceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-mcp-root-"));
  const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-mcp-outside-"));
  const outsideTrace = path.join(outsideRoot, "outside-trace");
  await fs.mkdir(outsideTrace);
  await fs.writeFile(
    path.join(outsideTrace, "trace.json"),
    `${JSON.stringify(fixtureTrace({ states: [] }), null, 2)}\n`,
    "utf8"
  );
  const client = startMcpClient(traceRoot);

  try {
    const summarize = await client.request({
      method: "tools/call",
      params: {
        name: "deltaframe_summarize_trace",
        arguments: { traceDir: outsideTrace }
      }
    });
    assert.match(summarize.error.message, /traceDir must stay inside/);

    const readResource = await client.request({
      method: "resources/read",
      params: { uri: `deltaframe://trace/${encodeURIComponent(outsideTrace)}` }
    });
    assert.match(readResource.error.message, /traceDir must stay inside/);

    const readSummaryResource = await client.request({
      method: "resources/read",
      params: { uri: `${traceResourceBase(outsideTrace)}/summary` }
    });
    assert.match(readSummaryResource.error.message, /traceDir must stay inside/);

    const capture = await client.request({
      method: "tools/call",
      params: {
        name: "deltaframe_capture_url",
        arguments: {
          url: "http://localhost:1",
          durationMs: 1,
          outDir: outsideRoot
        }
      }
    });
    assert.match(capture.error.message, /outDir must stay inside/);
  } finally {
    client.close();
  }
});

test("MCP rejects state image paths that escape the trace directory", async () => {
  const traceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-mcp-state-"));
  const traceDir = path.join(traceRoot, "bad-state-path");
  await fs.mkdir(traceDir);
  await fs.writeFile(
    path.join(traceDir, "trace.json"),
    `${JSON.stringify(fixtureTrace({
      states: [
        {
          id: "0001",
          label: "initial",
          timestampMs: 0,
          url: "http://localhost:3000/",
          image: "../secret.png"
        }
      ]
    }), null, 2)}\n`,
    "utf8"
  );
  const client = startMcpClient(traceRoot);

  try {
    const response = await client.request({
      method: "tools/call",
      params: {
        name: "deltaframe_get_state_image",
        arguments: { traceDir, stateId: "0001" }
      }
    });
    assert.match(response.error.message, /state image must stay inside/);

    const resource = await client.request({
      method: "resources/read",
      params: { uri: `${traceResourceBase(traceDir)}/state/0001/image` }
    });
    assert.match(resource.error.message, /state image must stay inside/);
  } finally {
    client.close();
  }
});

test("MCP rejects state image symlinks that escape the trace directory", async (t) => {
  const traceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-mcp-symlink-"));
  const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-mcp-symlink-outside-"));
  const traceDir = path.join(traceRoot, "bad-state-symlink");
  const framesDir = path.join(traceDir, "frames");
  const outsideImage = path.join(outsideRoot, "secret.png");
  const linkedImage = path.join(framesDir, "linked.png");

  await fs.mkdir(framesDir, { recursive: true });
  await fs.writeFile(outsideImage, "not really a png");
  try {
    await fs.symlink(outsideImage, linkedImage);
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") {
      t.skip(`symlink creation is not available: ${error.code}`);
      return;
    }
    throw error;
  }
  await fs.writeFile(
    path.join(traceDir, "trace.json"),
    `${JSON.stringify(fixtureTrace({
      states: [
        {
          id: "0001",
          label: "initial",
          timestampMs: 0,
          url: "http://localhost:3000/",
          image: "frames/linked.png"
        }
      ]
    }), null, 2)}\n`,
    "utf8"
  );
  const client = startMcpClient(traceRoot);

  try {
    const response = await client.request({
      method: "tools/call",
      params: {
        name: "deltaframe_get_state_image",
        arguments: { traceDir, stateId: "0001" }
      }
    });
    assert.match(response.error.message, /state image must stay inside/);

    const resource = await client.request({
      method: "resources/read",
      params: { uri: `${traceResourceBase(traceDir)}/state/0001/image` }
    });
    assert.match(resource.error.message, /state image must stay inside/);
  } finally {
    client.close();
  }
});

const FIXTURE_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

async function writeFixtureTrace(traceRoot, options = {}) {
  const traceDir = path.join(traceRoot, options.dirName || "fixture-trace");
  await fs.mkdir(path.join(traceDir, "frames"), { recursive: true });
  await fs.mkdir(path.join(traceDir, "diffs"), { recursive: true });
  const states = options.states || [
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
      route: "/settings",
      timestampMs: 500,
      url: "http://localhost:3000/settings",
      image: "frames/0002.png",
      diffFromPrevious: "diffs/0002.png",
      metrics: { ratio: 0.124 },
      keyframe: {
        rawFrameId: "raw-000003",
        selectionReasons: ["visual-change"],
        skippedRawFrameCount: 1
      }
    }
  ];
  for (const state of states) {
    if (state.image) {
      await writeFixturePng(path.join(traceDir, state.image));
    }
    if (state.diffFromPrevious) {
      await writeFixturePng(path.join(traceDir, state.diffFromPrevious));
    }
  }
  await fs.writeFile(
    path.join(traceDir, "trace.json"),
    `${JSON.stringify(fixtureTrace({
      name: options.name,
      states
    }), null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(traceDir, "curation.json"),
    `${JSON.stringify(options.curation || {
      version: 1,
      updatedAt: "2026-06-07T08:00:00.000Z",
      ignoredIds: [],
      annotations: {
        "0002": "Human note for Codex"
      }
    }, null, 2)}\n`,
    "utf8"
  );
  return traceDir;
}

async function writeFixturePng(file) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.from(FIXTURE_PNG_BASE64, "base64"));
}

function traceResourceBase(traceDir) {
  return `deltaframe://trace/${encodeURIComponent(traceDir)}`;
}

function startMcpClient(traceRoot) {
  const child = spawn(process.execPath, [
    path.join(process.cwd(), "bin", "deltaframe.js"),
    "mcp",
    "--trace-root",
    traceRoot
  ], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"]
  });

  const stderr = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  const responses = [];
  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", (line) => responses.push(JSON.parse(line)));

  let nextId = 1;
  return {
    stderr,
    async request(message) {
      const id = nextId;
      nextId += 1;
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, ...message })}\n`);
      await waitFor(() => responses.some((response) => response.id === id));
      return responses.find((response) => response.id === id);
    },
    close() {
      child.stdin.end();
      child.kill();
      rl.close();
    }
  };
}

function fixtureTrace({ name = "Fixture Trace", states = [] } = {}) {
  return {
    version: "0.1.0",
    name,
    createdAt: "2026-06-06T10:00:00.000Z",
    source: {
      type: "web",
      url: "http://localhost:3000",
      finalUrl: "http://localhost:3000/",
      viewport: { width: 800, height: 600 },
      fullPage: false
    },
    settings: {},
    states
  };
}

async function waitFor(predicate) {
  const deadline = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for MCP response.");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
