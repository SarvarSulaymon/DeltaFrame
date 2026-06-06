import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import test from "node:test";

test("MCP initialize and tools/list advertise DeltaFrame tools", async () => {
  const traceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-mcp-"));
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

  child.stdin.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "deltaframe-test", version: "0.0.0" }
    }
  })}\n`);
  child.stdin.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list"
  })}\n`);

  await waitFor(() => responses.length >= 2);
  child.stdin.end();
  child.kill();

  const initialize = responses.find((response) => response.id === 1);
  const toolsList = responses.find((response) => response.id === 2);

  assert.equal(initialize.result.serverInfo.name, "deltaframe");
  assert.equal(initialize.result.capabilities.tools.constructor, Object);

  const toolNames = toolsList.result.tools.map((tool) => tool.name);
  assert.equal(toolNames.includes("deltaframe_capture_url"), true);
  assert.equal(toolNames.includes("deltaframe_latest_trace"), true);
  assert.equal(toolNames.includes("deltaframe_review_trace"), true);
  assert.equal(stderr.join(""), "");
});

async function waitFor(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for MCP response.");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
