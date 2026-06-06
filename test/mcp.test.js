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
  assert.equal(client.stderr.join(""), "");
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
  } finally {
    client.close();
  }
});

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

function fixtureTrace({ states = [] } = {}) {
  return {
    version: "0.1.0",
    name: "Fixture Trace",
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
