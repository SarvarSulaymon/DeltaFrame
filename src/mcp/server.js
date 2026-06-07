import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { normalizeRawFrameOptions } from "../capture/rawFrames.js";
import { watchWeb } from "../capture/playwrightWatcher.js";
import { formatIssueGroup } from "../diagnostics/issues.js";
import { diffPngBuffers } from "../diff/imageDiff.js";
import { normalizeMaskRegions } from "../diff/masks.js";
import { compareTraces, findLatestTraceDir, listTraceDirs, readCuration, readTrace } from "../trace/store.js";
import { parseViewport } from "../utils/format.js";

const PROTOCOL_VERSION = "2025-06-18";
const TRACE_RESOURCE_PREFIX = "deltaframe://trace/";
const DEFAULT_CAPTURE_DURATION_MS = 10000;
const DEFAULT_RAW_FPS = 10;

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
      case "resources/templates/list":
        return this.listResourceTemplates();
      case "resources/read":
        return this.readResource(message.params?.uri);
      default:
        throw new Error(`Unsupported MCP method: ${message.method}`);
    }
  }

  tools() {
    return [
      {
        name: "deltaframe_capture_url",
        title: "Capture URL",
        description: "Capture a dense local web timeline, then expose distilled keyframes for Codex.",
        inputSchema: {
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string", description: "URL to capture, usually localhost or file://." },
            name: { type: "string", description: "Human name for the trace." },
            durationMs: { type: "number", description: "Capture duration in milliseconds. Must be positive for MCP calls. Default: 10000." },
            intervalMs: { type: "number", description: "Screenshot sample interval in milliseconds." },
            fps: { type: "number", description: "Raw capture frames per second. Implies rawFrames and sets intervalMs." },
            rawFrames: { type: "boolean", description: "Archive every sampled screenshot under raw/ for keyframe distillation. Default: true." },
            idleMs: { type: "number", description: "Wait after detecting a change before saving a stable frame." },
            minChangedRatio: { type: "number", description: "Minimum changed-pixel ratio required to save a new state." },
            pixelThreshold: { type: "number", description: "Per-pixel diff sensitivity passed to pixelmatch." },
            masks: {
              anyOf: [
                {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["x", "y", "width", "height"],
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                      width: { type: "number" },
                      height: { type: "number" },
                      label: { type: "string" }
                    }
                  }
                },
                { type: "string", description: "JSON array of mask regions." }
              ],
              description: "Rectangles ignored during image diffing. Captured screenshots remain unmasked."
            },
            maxFrames: { type: "number", description: "Stop after saving this many states." },
            viewport: {
              anyOf: [
                { type: "string", description: "Viewport as WIDTHxHEIGHT, for example 1440x900." },
                {
                  type: "object",
                  required: ["width", "height"],
                  properties: {
                    width: { type: "number" },
                    height: { type: "number" }
                  }
                }
              ]
            },
            fullPage: { type: "boolean", description: "Capture full-page screenshots." },
            headed: { type: "boolean", description: "Show the browser for manual interaction." },
            channel: { type: "string", description: "Playwright browser channel, for example chrome or msedge." },
            outDir: { type: "string", description: "Trace root directory. Defaults to the MCP server trace root." }
          }
        }
      },
      {
        name: "deltaframe_latest_trace",
        title: "Latest Trace",
        description: "Return the newest DeltaFrame trace directory and summary metadata.",
        inputSchema: {
          type: "object",
          properties: {
            traceRoot: { type: "string", description: "Optional trace root directory." }
          }
        }
      },
      {
        name: "deltaframe_review_trace",
        title: "Review Trace",
        description: "Return the local CLI command and URL for reviewing a trace without blocking the MCP server.",
        inputSchema: {
          type: "object",
          properties: {
            traceDir: { type: "string", description: "Trace directory. Defaults to latest trace." },
            port: { type: "number", description: "Local HTTP port. Default: 7799." }
          }
        }
      },
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
      },
      {
        name: "deltaframe_compare_traces",
        title: "Compare Before/After Traces",
        description: "Compare a before trace and an after trace to verify whether a focused UI change landed.",
        inputSchema: {
          type: "object",
          required: ["beforeTraceDir", "afterTraceDir"],
          properties: {
            beforeTraceDir: { type: "string", description: "Trace directory captured before the UI change." },
            afterTraceDir: { type: "string", description: "Trace directory captured after the UI change." },
            focus: { type: "string", description: "Optional area or state to focus on while comparing." },
            expectation: { type: "string", description: "Optional expected visual outcome to include in the report." }
          }
        }
      }
    ];
  }

  async callTool(name, args) {
    switch (name) {
      case "deltaframe_capture_url":
        return this.toolCaptureUrl(args);
      case "deltaframe_latest_trace":
        return this.toolLatestTrace(args);
      case "deltaframe_review_trace":
        return this.toolReviewTrace(args);
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
      case "deltaframe_compare_traces":
        return this.toolCompareTraces(args);
      default:
        throw new Error(`Unknown DeltaFrame tool: ${name}`);
    }
  }

  async toolCaptureUrl(args) {
    if (!args.url || typeof args.url !== "string") {
      throw new Error("deltaframe_capture_url requires a string url.");
    }

    const durationMs = numberOption(args.durationMs, DEFAULT_CAPTURE_DURATION_MS, "durationMs");
    if (durationMs <= 0) {
      throw new Error("durationMs must be positive for MCP capture calls.");
    }

    const outDir = await this.resolveOutputRoot(args.outDir);
    if (args.rawFrames === false && args.fps !== undefined) {
      throw new Error("fps implies rawFrames; omit fps or set rawFrames true.");
    }
    const rawFramesEnabled = booleanOption(args.rawFrames, true, "rawFrames");
    const rawFrameOptions = normalizeRawFrameOptions({
      enabled: rawFramesEnabled,
      fps: args.fps ?? (rawFramesEnabled && args.intervalMs === undefined ? DEFAULT_RAW_FPS : undefined),
      intervalMs: numberOption(args.intervalMs, rawFramesEnabled ? Math.round(1000 / DEFAULT_RAW_FPS) : 200, "intervalMs")
    });
    const result = await watchWeb({
      url: args.url,
      name: stringOption(args.name),
      outDir,
      intervalMs: rawFrameOptions.intervalMs,
      idleMs: numberOption(args.idleMs, rawFrameOptions.enabled ? 0 : 350, "idleMs"),
      durationMs,
      minChangedRatio: numberOption(args.minChangedRatio, 0.003, "minChangedRatio"),
      pixelThreshold: numberOption(args.pixelThreshold, 0.12, "pixelThreshold"),
      maxFrames: numberOption(args.maxFrames, 80, "maxFrames"),
      viewport: viewportOption(args.viewport),
      fullPage: booleanOption(args.fullPage, false, "fullPage"),
      headed: booleanOption(args.headed, false, "headed"),
      channel: stringOption(args.channel),
      verbose: false,
      masks: normalizeMaskRegions(args.masks),
      rawFrames: rawFrameOptions.enabled,
      rawFps: rawFrameOptions.fps
    });

    return jsonResult({
      traceDir: result.traceDir,
      stateCount: result.trace.states.length,
      rawFrameCount: result.trace.rawFrames?.length || 0,
      summary: buildSummary(result.traceDir, result.trace),
      metadata: buildTraceMetadata(result.traceDir, result.trace)
    });
  }

  async toolLatestTrace(args) {
    const traceRoot = await this.resolveTraceRoot(args.traceRoot);
    const traceDir = await findLatestTraceDir(traceRoot);
    if (!traceDir) {
      throw new Error(`No DeltaFrame traces found under ${path.resolve(traceRoot)}`);
    }

    const trace = await readTrace(traceDir);
    const curation = await readCuration(traceDir, trace);
    return jsonResult({
      traceDir,
      summary: buildSummary(traceDir, trace, curation),
      metadata: buildTraceMetadata(traceDir, trace, curation)
    });
  }

  async toolReviewTrace(args) {
    const traceDir = await this.resolveTraceDir(args.traceDir);
    const trace = await readTrace(traceDir);
    const port = numberOption(args.port, 7799, "port");
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`port must be an integer from 1 to 65535, got ${args.port}`);
    }

    return jsonResult({
      traceDir,
      port,
      localUrl: `http://127.0.0.1:${port}`,
      command: buildReviewCommand(traceDir, port),
      summary: `Run the command, then open http://127.0.0.1:${port} to review ${trace.name}.`,
      metadata: buildTraceMetadata(traceDir, trace)
    });
  }

  async toolListTraces(args) {
    const traceRoot = await this.resolveTraceRoot(args.traceRoot);
    const traces = await listTraceDirs(traceRoot);
    return textResult(JSON.stringify(traces, null, 2));
  }

  async toolListStates(args) {
    const traceDir = await this.resolveTraceDir(args.traceDir);
    const trace = await readTrace(traceDir);
    const curation = await readCuration(traceDir, trace);
    const states = trace.states.map((state) => ({
      id: state.id,
      label: state.label,
      route: state.route || null,
      timestampMs: state.timestampMs,
      url: state.url,
      changedRatio: state.metrics?.ratio ?? null,
      keyframe: state.keyframe || null,
      annotation: annotationFor(curation, state.id) || null,
      issues: state.issues || [],
      image: resolveTraceFile(traceDir, state.image, "state image"),
      diffFromPrevious: state.diffFromPrevious ? resolveTraceFile(traceDir, state.diffFromPrevious, "state diff") : null
    }));
    return textResult(JSON.stringify({ traceDir, name: trace.name, states }, null, 2));
  }

  async toolGetStateImage(args) {
    const traceDir = await this.resolveTraceDir(args.traceDir);
    const { state } = await this.findState(traceDir, args.stateId);
    const image = await readTraceFile(traceDir, state.image, "state image");
    return {
      content: [
        { type: "text", text: `${state.id} ${state.label}\n${state.url}` },
        { type: "image", data: image.toString("base64"), mimeType: "image/png" }
      ]
    };
  }

  async toolCompareStates(args) {
    const traceDir = await this.resolveTraceDir(args.traceDir);
    const { trace, state: fromState } = await this.findState(traceDir, args.fromStateId);
    const { state: toState } = await this.findState(traceDir, args.toStateId);
    const fromImage = await readTraceFile(traceDir, fromState.image, "from state image");
    const toImage = await readTraceFile(traceDir, toState.image, "to state image");
    const masks = normalizeMaskRegions(trace.settings?.masks);
    const diff = await diffPngBuffers(fromImage, toImage, { masks });
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
    const curation = await readCuration(traceDir, trace);
    return textResult(buildSummary(traceDir, trace, curation));
  }

  async toolCompareTraces(args) {
    if (!args.beforeTraceDir || typeof args.beforeTraceDir !== "string") {
      throw new Error("deltaframe_compare_traces requires a string beforeTraceDir.");
    }
    if (!args.afterTraceDir || typeof args.afterTraceDir !== "string") {
      throw new Error("deltaframe_compare_traces requires a string afterTraceDir.");
    }

    const beforeTraceDir = await this.resolveTraceDir(args.beforeTraceDir);
    const afterTraceDir = await this.resolveTraceDir(args.afterTraceDir);
    return jsonResult(await compareTraces(beforeTraceDir, afterTraceDir, {
      focus: stringOption(args.focus),
      expectation: stringOption(args.expectation)
    }));
  }

  async listResources() {
    const traces = await listTraceDirs(this.traceRoot);
    const resources = [];
    for (const trace of traces) {
      const baseUri = traceResourceBase(trace.path);
      resources.push(
        {
          uri: baseUri,
          name: trace.name,
          description: `${trace.states} visual state(s), created ${trace.createdAt}`,
          mimeType: "application/json"
        },
        {
          uri: `${baseUri}/summary`,
          name: `${trace.name} summary`,
          description: `Markdown summary for ${trace.name}`,
          mimeType: "text/markdown"
        },
        {
          uri: `${baseUri}/states`,
          name: `${trace.name} states`,
          description: `Compact state index for ${trace.name}`,
          mimeType: "application/json"
        }
      );
    }

    return {
      resources
    };
  }

  listResourceTemplates() {
    return {
      resourceTemplates: [
        {
          uriTemplate: "deltaframe://trace/{encodedTraceDir}",
          name: "DeltaFrame trace JSON",
          description: "Full trace.json for a DeltaFrame trace directory.",
          mimeType: "application/json"
        },
        {
          uriTemplate: "deltaframe://trace/{encodedTraceDir}/summary",
          name: "DeltaFrame trace summary",
          description: "Markdown summary of a DeltaFrame trace.",
          mimeType: "text/markdown"
        },
        {
          uriTemplate: "deltaframe://trace/{encodedTraceDir}/states",
          name: "DeltaFrame trace state index",
          description: "Compact JSON index of states in a DeltaFrame trace.",
          mimeType: "application/json"
        },
        {
          uriTemplate: "deltaframe://trace/{encodedTraceDir}/state/{stateId}",
          name: "DeltaFrame state JSON",
          description: "JSON metadata for a single captured visual state.",
          mimeType: "application/json"
        },
        {
          uriTemplate: "deltaframe://trace/{encodedTraceDir}/state/{stateId}/image",
          name: "DeltaFrame state image",
          description: "PNG screenshot for a single captured visual state.",
          mimeType: "image/png"
        },
        {
          uriTemplate: "deltaframe://trace/{encodedTraceDir}/state/{stateId}/diff",
          name: "DeltaFrame previous-state diff",
          description: "PNG diff from the previous captured state, when available.",
          mimeType: "image/png"
        }
      ]
    };
  }

  async readResource(uri) {
    const resource = parseTraceResourceUri(uri);
    if (!resource) {
      throw new Error(`Unsupported resource URI: ${uri}`);
    }

    const resolvedTraceDir = await this.resolveTraceDir(resource.traceDir);
    const trace = await readTrace(resolvedTraceDir);
    const curation = await readCuration(resolvedTraceDir, trace);
    const baseUri = traceResourceBase(resolvedTraceDir);

    if (resource.kind === "trace") {
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

    if (resource.kind === "summary") {
      return textResource(uri, "text/markdown", buildSummaryMarkdown(resolvedTraceDir, trace, curation));
    }

    if (resource.kind === "states") {
      return textResource(uri, "application/json", JSON.stringify(buildStateIndex(resolvedTraceDir, trace, baseUri, curation), null, 2));
    }

    const { state } = await this.findState(resolvedTraceDir, resource.stateId);

    if (resource.kind === "state") {
      return textResource(uri, "application/json", JSON.stringify(buildStateDetails(resolvedTraceDir, trace, state, baseUri, curation), null, 2));
    }

    if (resource.kind === "stateImage") {
      const image = await readTraceFile(resolvedTraceDir, state.image, "state image");
      return blobResource(uri, "image/png", image);
    }

    if (resource.kind === "stateDiff") {
      if (!state.diffFromPrevious) {
        throw new Error(`State ${state.id} does not have a previous diff image.`);
      }
      const diff = await readTraceFile(resolvedTraceDir, state.diffFromPrevious, "state diff");
      return blobResource(uri, "image/png", diff);
    }

    throw new Error(`Unsupported resource URI: ${uri}`);
  }

  async resolveTraceDir(traceDir) {
    if (traceDir) {
      return await this.resolveExistingPath(traceDir, "traceDir");
    }
    const latest = await findLatestTraceDir(this.traceRoot);
    if (!latest) {
      throw new Error(`No DeltaFrame traces found under ${this.traceRoot}`);
    }
    return await this.resolveExistingPath(latest, "latest traceDir");
  }

  async resolveTraceRoot(traceRoot) {
    if (!traceRoot) return this.traceRoot;
    const resolved = this.resolveInsideTraceRoot(traceRoot, "traceRoot");
    if (!await exists(resolved)) return resolved;
    return await this.resolveExistingPath(resolved, "traceRoot");
  }

  async resolveOutputRoot(outDir) {
    const outputRoot = this.resolveInsideTraceRoot(outDir || this.traceRoot, "outDir");
    if (await exists(outputRoot)) {
      return await this.resolveExistingPath(outputRoot, "outDir");
    }

    const nearest = await nearestExistingAncestor(outputRoot);
    if (nearest && await exists(this.traceRoot)) {
      await assertRealPathInside(await fs.realpath(this.traceRoot), nearest, "outDir");
    }
    return outputRoot;
  }

  resolveInsideTraceRoot(target, label) {
    const resolved = path.resolve(target);
    assertPathInside(this.traceRoot, resolved, label);
    return resolved;
  }

  async resolveExistingPath(target, label) {
    const resolved = this.resolveInsideTraceRoot(target, label);
    return await assertRealPathInside(await fs.realpath(this.traceRoot), resolved, label);
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

function parseTraceResourceUri(uri) {
  if (typeof uri !== "string" || !uri.startsWith(TRACE_RESOURCE_PREFIX)) {
    return undefined;
  }

  const rest = uri.slice(TRACE_RESOURCE_PREFIX.length);
  const [encodedTraceDir, ...suffix] = rest.split("/");
  if (!encodedTraceDir) return undefined;

  let traceDir;
  try {
    traceDir = decodeURIComponent(encodedTraceDir);
  } catch {
    return undefined;
  }

  if (!suffix.length) {
    return { kind: "trace", traceDir };
  }

  if (suffix.length === 1 && suffix[0] === "summary") {
    return { kind: "summary", traceDir };
  }

  if (suffix.length === 1 && suffix[0] === "states") {
    return { kind: "states", traceDir };
  }

  if (suffix[0] !== "state" || suffix.length < 2 || suffix.length > 3) {
    return undefined;
  }

  let stateId;
  try {
    stateId = decodeURIComponent(suffix[1]);
  } catch {
    return undefined;
  }
  if (!stateId || stateId.includes("/") || stateId.includes("\\")) {
    return undefined;
  }

  if (suffix.length === 2) {
    return { kind: "state", traceDir, stateId };
  }

  if (suffix[2] === "image") {
    return { kind: "stateImage", traceDir, stateId };
  }

  if (suffix[2] === "diff") {
    return { kind: "stateDiff", traceDir, stateId };
  }

  return undefined;
}

function traceResourceBase(traceDir) {
  return `${TRACE_RESOURCE_PREFIX}${encodeURIComponent(traceDir)}`;
}

function stateResourceBase(baseUri, stateId) {
  return `${baseUri}/state/${encodeURIComponent(stateId)}`;
}

function textResource(uri, mimeType, text) {
  return {
    contents: [
      {
        uri,
        mimeType,
        text
      }
    ]
  };
}

function blobResource(uri, mimeType, buffer) {
  return {
    contents: [
      {
        uri,
        mimeType,
        blob: buffer.toString("base64")
      }
    ]
  };
}

function resolveTraceFile(traceDir, filePath, label) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  const resolved = path.resolve(traceDir, filePath);
  assertPathInside(traceDir, resolved, label);
  return resolved;
}

async function readTraceFile(traceDir, filePath, label) {
  const resolved = resolveTraceFile(traceDir, filePath, label);
  const realTraceDir = await fs.realpath(traceDir);
  const realFile = await assertRealPathInside(realTraceDir, resolved, label);
  return fs.readFile(realFile);
}

function assertPathInside(root, target, label) {
  const relative = path.relative(root, target);
  if (relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`${label} must stay inside ${root}.`);
}

async function assertRealPathInside(realRoot, target, label) {
  const realTarget = await fs.realpath(target);
  assertPathInside(realRoot, realTarget, label);
  return realTarget;
}

async function nearestExistingAncestor(target) {
  let current = path.resolve(target);
  while (!await exists(current)) {
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return current;
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function textResult(text) {
  return {
    content: [{ type: "text", text }]
  };
}

function jsonResult(value) {
  return textResult(JSON.stringify(value, null, 2));
}

function buildSummary(traceDir, trace, curation = {}) {
  const lines = [];
  lines.push(`DeltaFrame trace: ${trace.name}`);
  lines.push(`Path: ${traceDir}`);
  lines.push(`Source: ${trace.source.url}`);
  lines.push(`States: ${trace.states.length}`);
  if (trace.rawFrames?.length) {
    lines.push(`Raw frames: ${trace.rawFrames.length}`);
  }
  if (trace.settings?.keyframes?.strategy) {
    lines.push(`Keyframe strategy: ${trace.settings.keyframes.strategy}`);
  }
  const annotations = annotationCount(curation);
  if (annotations) {
    lines.push(`Annotations: ${annotations}`);
  }
  lines.push("");
  for (const state of trace.states) {
    const changed = state.metrics ? `${(state.metrics.ratio * 100).toFixed(3)}% changed` : "initial";
    const route = state.route ? `, route ${state.route}` : "";
    lines.push(`- ${state.id} ${state.label}: ${changed}${route}, ${state.url}`);
    if (state.keyframe?.selectionReasons?.length) {
      lines.push(`  keyframe: ${state.keyframe.selectionReasons.join(", ")} from ${state.keyframe.rawFrameId}`);
    }
    const annotation = annotationFor(curation, state.id);
    if (annotation) {
      lines.push(`  annotation: ${annotation}`);
    }
    for (const issue of state.issues || []) {
      lines.push(`  issue: ${formatIssueGroup(issue)}`);
    }
  }
  return lines.join("\n");
}

function buildSummaryMarkdown(traceDir, trace, curation = {}) {
  const states = trace.states || [];
  const lines = [];
  lines.push(`# ${trace.name}`);
  lines.push("");
  lines.push(`- Path: \`${traceDir}\``);
  lines.push(`- Source: ${trace.source?.url || "unknown"}`);
  lines.push(`- Created: ${trace.createdAt || "unknown"}`);
  lines.push(`- States: ${states.length}`);
  lines.push(`- Raw frames: ${trace.rawFrames?.length || 0}`);
  if (trace.settings?.keyframes?.strategy) {
    lines.push(`- Keyframe strategy: ${trace.settings.keyframes.strategy}`);
  }
  lines.push(`- Annotations: ${annotationCount(curation)}`);
  lines.push(`- Issue groups: ${states.reduce((total, state) => total + (state.issues?.length || 0), 0)}`);
  lines.push("");
  lines.push("## States");
  lines.push("");

  for (const state of states) {
    const changed = state.metrics ? `${(state.metrics.ratio * 100).toFixed(3)}% changed` : "initial";
    const route = state.route ? `, route ${state.route}` : "";
    lines.push(`- **${state.id} ${state.label}**: ${changed}${route}`);
    lines.push(`  - URL: ${state.url}`);
    if (state.image) {
      lines.push(`  - Image: \`${state.image}\``);
    }
    if (state.keyframe?.selectionReasons?.length) {
      lines.push(`  - Keyframe: ${state.keyframe.selectionReasons.join(", ")} from \`${state.keyframe.rawFrameId}\``);
    }
    if (state.diffFromPrevious) {
      lines.push(`  - Previous diff: \`${state.diffFromPrevious}\``);
    }
    const annotation = annotationFor(curation, state.id);
    if (annotation) {
      lines.push(`  - Annotation: ${annotation}`);
    }
    for (const issue of state.issues || []) {
      lines.push(`  - Issue: ${formatIssueGroup(issue)}`);
    }
  }

  return lines.join("\n");
}

function buildStateIndex(traceDir, trace, baseUri, curation = {}) {
  const states = trace.states || [];
  return {
    traceDir,
    name: trace.name,
    createdAt: trace.createdAt,
    source: {
      url: trace.source?.url,
      finalUrl: trace.source?.finalUrl,
      viewport: trace.source?.viewport,
      fullPage: Boolean(trace.source?.fullPage)
    },
    stateCount: states.length,
    rawFrameCount: trace.rawFrames?.length || 0,
    keyframeStrategy: trace.settings?.keyframes?.strategy || null,
    annotationCount: annotationCount(curation),
    states: states.map((state) => compactState(traceDir, state, baseUri, curation))
  };
}

function buildStateDetails(traceDir, trace, state, baseUri, curation = {}) {
  return {
    traceDir,
    trace: {
      name: trace.name,
      createdAt: trace.createdAt,
      source: trace.source
    },
    state,
    annotation: annotationFor(curation, state.id) || null,
    resources: stateResourceLinks(traceDir, state, baseUri)
  };
}

function compactState(traceDir, state, baseUri, curation = {}) {
  return {
    id: state.id,
    label: state.label,
    route: state.route || null,
    timestampMs: state.timestampMs,
    url: state.url,
    changedRatio: state.metrics?.ratio ?? null,
    keyframe: state.keyframe || null,
    annotation: annotationFor(curation, state.id) || null,
    issueCount: state.issues?.length || 0,
    resources: stateResourceLinks(traceDir, state, baseUri)
  };
}

function stateResourceLinks(traceDir, state, baseUri) {
  const stateBaseUri = stateResourceBase(baseUri, state.id);
  const resources = {
    json: stateBaseUri
  };

  if (state.image) {
    resolveTraceFile(traceDir, state.image, "state image");
    resources.image = `${stateBaseUri}/image`;
  }

  if (state.diffFromPrevious) {
    resolveTraceFile(traceDir, state.diffFromPrevious, "state diff");
    resources.diff = `${stateBaseUri}/diff`;
  }

  return resources;
}

function buildTraceMetadata(traceDir, trace, curation = {}) {
  const states = trace.states || [];
  const lastState = states[states.length - 1];
  return {
    traceDir,
    name: trace.name,
    version: trace.version,
    createdAt: trace.createdAt,
    source: {
      type: trace.source?.type,
      url: trace.source?.url,
      finalUrl: trace.source?.finalUrl,
      viewport: trace.source?.viewport,
      fullPage: Boolean(trace.source?.fullPage)
    },
    settings: trace.settings || {},
    stateCount: states.length,
    rawFrameCount: trace.rawFrames?.length || 0,
    keyframeStrategy: trace.settings?.keyframes?.strategy || null,
    annotationCount: annotationCount(curation),
    issueGroupCount: states.reduce((total, state) => total + (state.issues?.length || 0), 0),
    firstStateId: states[0]?.id,
    lastStateId: lastState?.id,
    lastStateLabel: lastState?.label
  };
}

function annotationFor(curation, stateId) {
  const value = curation?.annotations?.[stateId];
  return typeof value === "string" && value ? value : undefined;
}

function annotationCount(curation) {
  return Object.keys(curation?.annotations || {}).length;
}

function viewportOption(value) {
  if (value === undefined) return parseViewport("1440x900");
  if (typeof value === "string") return parseViewport(value);
  if (value && typeof value === "object") {
    const width = numberOption(value.width, undefined, "viewport.width");
    const height = numberOption(value.height, undefined, "viewport.height");
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error("viewport width and height must be positive integers.");
    }
    return { width, height };
  }
  throw new Error("viewport must be a WIDTHxHEIGHT string or an object with width and height.");
}

function numberOption(value, fallback, name) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number, got ${value}`);
  }
  return parsed;
}

function stringOption(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}

function booleanOption(value, fallback, name) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be a boolean, got ${value}`);
}

function buildReviewCommand(traceDir, port) {
  const binPath = process.argv[1] || "deltaframe";
  const executable = binPath.endsWith("deltaframe.js")
    ? `${quoteCommandPart(process.execPath)} ${quoteCommandPart(binPath)}`
    : "deltaframe";
  return `${executable} review ${quoteCommandPart(traceDir)} --port ${port}`;
}

function quoteCommandPart(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=+-]+$/.test(text)) return text;
  return `"${text.replaceAll('"', '\\"')}"`;
}
