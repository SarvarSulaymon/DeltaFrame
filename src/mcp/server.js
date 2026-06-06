import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { diffPngBuffers } from "../diff/imageDiff.js";
import { findLatestTraceDir, listTraceDirs, readTrace } from "../trace/store.js";

const PROTOCOL_VERSION = "2025-06-18";

export async function startMcpServer({ traceRoot }) {
  const server = new DeltaFrameMcpServer(traceRoot);
  server.start();
}

class DeltaFrameMcpServer {
  constructor(traceRoot) {
    this.traceRoot = path.resolve(traceRoot || ".deltaframe/traces");
  }

  start() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: false
    });

    rl.on("line", async (line) => {
      if (!line.trim()) return;
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        this.writeError(null, -32700, `Invalid JSON: ${error.message}`);
        return;
      }

      if (!("id" in message)) {
        await this.handleNotification(message).catch((error) => {
          console.error(error.stack || error.message);
        });
        return;
      }

      try {
        const result = await this.handleRequest(message);
        this.write({ jsonrpc: "2.0", id: message.id, result });
      } catch (error) {
        this.writeError(message.id, -32000, error.message || String(error));
      }
    });
  }

  async handleNotification(message) {
    if (message.method === "notifications/initialized") return;
    console.error(`Unhandled MCP notification: ${message.method}`);
  }

  async handleRequest(message) {
    switch (message.method) {
      case "initialize":
        return {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: {},
            resources: {}
          },
          serverInfo: {
            name: "deltaframe",
            version: "0.1.0"
          }
        };
      case "ping":
        return {};
      case "tools/list":
        return { tools: this.tools() };
      case "tools/call":
        return this.callTool(message.params?.name, message.params?.arguments || {});
      case "resources/list":
        return this.listResources();
      case "resources/read":
        return this.readResource(message.params?.uri);
      default:
        throw new Error(`Unsupported MCP method: ${message.method}`);
    }
  }

  tools() {
    return [
      {
        name: "deltaframe_list_traces",
        title: "List DeltaFrame Traces",
        description: "List captured DeltaFrame traces available on this machine.",
        inputSchema: {
          type: "object",
          properties: {
            traceRoot: { type: "string", description: "Optional trace root directory." }
          }
        }
      },
      {
        name: "deltaframe_list_states",
        title: "List Visual States",
        description: "List saved visual states in a DeltaFrame trace.",
        inputSchema: {
          type: "object",
          properties: {
            traceDir: { type: "string", description: "Trace directory. Defaults to latest trace." }
          }
        }
      },
      {
        name: "deltaframe_get_state_image",
        title: "Get State Image",
        description: "Return a captured visual state image as PNG.",
        inputSchema: {
          type: "object",
          required: ["stateId"],
          properties: {
            traceDir: { type: "string", description: "Trace directory. Defaults to latest trace." },
            stateId: { type: "string", description: "State id, for example 0002." }
          }
        }
      },
      {
        name: "deltaframe_compare_states",
        title: "Compare States",
        description: "Return a PNG diff between two saved visual states.",
        inputSchema: {
          type: "object",
          required: ["fromStateId", "toStateId"],
          properties: {
            traceDir: { type: "string", description: "Trace directory. Defaults to latest trace." },
            fromStateId: { type: "string" },
            toStateId: { type: "string" }
          }
        }
      },
      {
        name: "deltaframe_summarize_trace",
        title: "Summarize Trace",
        description: "Return a compact text summary of a DeltaFrame trace.",
        inputSchema: {
          type: "object",
          properties: {
            traceDir: { type: "string", description: "Trace directory. Defaults to latest trace." }
          }
        }
      }
    ];
  }

  async callTool(name, args) {
    switch (name) {
      case "deltaframe_list_traces":
        return this.toolListTraces(args);
      case "deltaframe_list_states":
        return this.toolListStates(args);
      case "deltaframe_get_state_image":
        return this.toolGetStateImage(args);
      case "deltaframe_compare_states":
        return this.toolCompareStates(args);
      case "deltaframe_summarize_trace":
        return this.toolSummarizeTrace(args);
      default:
        throw new Error(`Unknown DeltaFrame tool: ${name}`);
    }
  }

  async toolListTraces(args) {
    const traces = await listTraceDirs(args.traceRoot || this.traceRoot);
    return textResult(JSON.stringify(traces, null, 2));
  }

  async toolListStates(args) {
    const traceDir = await this.resolveTraceDir(args.traceDir);
    const trace = await readTrace(traceDir);
    const states = trace.states.map((state) => ({
      id: state.id,
      label: state.label,
      timestampMs: state.timestampMs,
      url: state.url,
      changedRatio: state.metrics?.ratio ?? null,
      image: path.join(traceDir, state.image),
      diffFromPrevious: state.diffFromPrevious ? path.join(traceDir, state.diffFromPrevious) : null
    }));
    return textResult(JSON.stringify({ traceDir, name: trace.name, states }, null, 2));
  }

  async toolGetStateImage(args) {
    const traceDir = await this.resolveTraceDir(args.traceDir);
    const { state } = await this.findState(traceDir, args.stateId);
    const imagePath = path.join(traceDir, state.image);
    const image = await fs.readFile(imagePath);
    return {
      content: [
        { type: "text", text: `${state.id} ${state.label}\n${state.url}` },
        { type: "image", data: image.toString("base64"), mimeType: "image/png" }
      ]
    };
  }

  async toolCompareStates(args) {
    const traceDir = await this.resolveTraceDir(args.traceDir);
    const { state: fromState } = await this.findState(traceDir, args.fromStateId);
    const { state: toState } = await this.findState(traceDir, args.toStateId);
    const fromImage = await fs.readFile(path.join(traceDir, fromState.image));
    const toImage = await fs.readFile(path.join(traceDir, toState.image));
    const diff = await diffPngBuffers(fromImage, toImage);
    return {
      content: [
        {
          type: "text",
          text: `Changed ${(diff.ratio * 100).toFixed(3)}% of pixels between ${fromState.id} and ${toState.id}.`
        },
        { type: "image", data: diff.diffBuffer.toString("base64"), mimeType: "image/png" }
      ]
    };
  }

  async toolSummarizeTrace(args) {
    const traceDir = await this.resolveTraceDir(args.traceDir);
    const trace = await readTrace(traceDir);
    return textResult(buildSummary(traceDir, trace));
  }

  async listResources() {
    const traces = await listTraceDirs(this.traceRoot);
    return {
      resources: traces.map((trace) => ({
        uri: `deltaframe://trace/${encodeURIComponent(trace.path)}`,
        name: trace.name,
        description: `${trace.states} visual state(s), created ${trace.createdAt}`,
        mimeType: "application/json"
      }))
    };
  }

  async readResource(uri) {
    if (!uri?.startsWith("deltaframe://trace/")) {
      throw new Error(`Unsupported resource URI: ${uri}`);
    }
    const traceDir = decodeURIComponent(uri.slice("deltaframe://trace/".length));
    const trace = await readTrace(traceDir);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(trace, null, 2)
        }
      ]
    };
  }

  async resolveTraceDir(traceDir) {
    if (traceDir) return path.resolve(traceDir);
    const latest = await findLatestTraceDir(this.traceRoot);
    if (!latest) {
      throw new Error(`No DeltaFrame traces found under ${this.traceRoot}`);
    }
    return latest;
  }

  async findState(traceDir, stateId) {
    const trace = await readTrace(traceDir);
    const state = trace.states.find((item) => item.id === stateId);
    if (!state) {
      throw new Error(`State ${stateId} not found in ${traceDir}`);
    }
    return { trace, state };
  }

  write(message) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  }

  writeError(id, code, message) {
    this.write({
      jsonrpc: "2.0",
      id,
      error: { code, message }
    });
  }
}

function textResult(text) {
  return {
    content: [{ type: "text", text }]
  };
}

function buildSummary(traceDir, trace) {
  const lines = [];
  lines.push(`DeltaFrame trace: ${trace.name}`);
  lines.push(`Path: ${traceDir}`);
  lines.push(`Source: ${trace.source.url}`);
  lines.push(`States: ${trace.states.length}`);
  lines.push("");
  for (const state of trace.states) {
    const changed = state.metrics ? `${(state.metrics.ratio * 100).toFixed(3)}% changed` : "initial";
    lines.push(`- ${state.id} ${state.label}: ${changed}, ${state.url}`);
  }
  return lines.join("\n");
}
