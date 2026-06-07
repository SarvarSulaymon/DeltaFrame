import fs from "node:fs/promises";
import path from "node:path";
import { listDesktopSources, listDesktopWindows, watchDesktop } from "./capture/desktopWatcher.js";
import { capturePlaywrightFlow } from "./capture/playwrightFlow.js";
import { normalizeRawFrameOptions } from "./capture/rawFrames.js";
import { watchWeb } from "./capture/playwrightWatcher.js";
import { createTerminalCaptureControl } from "./capture/terminalControls.js";
import { normalizeMaskRegions } from "./diff/masks.js";
import { startMcpServer } from "./mcp/server.js";
import { startReviewServer } from "./review/server.js";
import { evaluateTraceComparison } from "./trace/baseline.js";
import { compareTraces, findLatestTraceDir, readTrace } from "./trace/store.js";
import { parseArgs } from "./utils/args.js";
import { loadPackage, packageAvailable } from "./utils/deps.js";
import { parseRegion, parseViewport } from "./utils/format.js";

const DEFAULT_TRACE_ROOT = ".deltaframe/traces";
const DEFAULT_WEB_RAW_FPS = 10;
const DEFAULT_DESKTOP_RAW_FPS = 5;
const DEFAULT_WATCH_DURATION_MS = 10000;

export async function main(argv) {
  const parsed = parseArgs(argv);
  const command = parsed.command;

  if (!command || command === "help" || parsed.flags.help || parsed.flags.h) {
    printHelp();
    return;
  }

  if (command === "watch") {
    await runWatch(parsed);
    return;
  }

  if (command === "review") {
    await runReview(parsed);
    return;
  }

  if (command === "desktop") {
    await runDesktop(parsed);
    return;
  }

  if (command === "flow") {
    await runFlow(parsed);
    return;
  }

  if (command === "mcp") {
    await startMcpServer({
      traceRoot: parsed.flags["trace-root"] || parsed.flags.out || DEFAULT_TRACE_ROOT
    });
    return;
  }

  if (command === "summarize") {
    await runSummarize(parsed);
    return;
  }

  if (command === "compare") {
    await runCompare(parsed);
    return;
  }

  if (command === "doctor") {
    await runDoctor(parsed.flags);
    return;
  }

  throw new Error(`Unknown command: ${command}\nRun "deltaframe --help" for usage.`);
}

async function runWatch(parsed) {
  const url = parsed.flags.url || parsed.positionals[0];
  if (!url) {
    throw new Error("Missing URL. Example: deltaframe watch --url http://localhost:3000");
  }

  const viewport = parseViewport(parsed.flags.viewport || "1440x900");
  const masks = await maskOptions(parsed.flags);
  if (parsed.flags.sparse && (parsed.flags["raw-frames"] || parsed.flags.fps !== undefined)) {
    throw new Error("Use either --sparse or raw capture flags, not both.");
  }
  const useRawFrames = !parsed.flags.sparse;
  const rawFrameOptions = normalizeRawFrameOptions({
    enabled: useRawFrames || parsed.flags["raw-frames"],
    fps: parsed.flags.fps ?? (useRawFrames && parsed.flags.interval === undefined ? DEFAULT_WEB_RAW_FPS : undefined),
    intervalMs: numberFlag(parsed.flags.interval, useRawFrames ? Math.round(1000 / DEFAULT_WEB_RAW_FPS) : 200)
  });
  const idleMs = numberFlag(parsed.flags.idle, rawFrameOptions.enabled ? 0 : 350);
  const controls = shouldEnableWatchControls(parsed.flags)
    ? createTerminalCaptureControl()
    : undefined;
  const result = await watchWeb({
    url,
    name: parsed.flags.name,
    outDir: parsed.flags.out || DEFAULT_TRACE_ROOT,
    intervalMs: rawFrameOptions.intervalMs,
    idleMs,
    durationMs: numberFlag(parsed.flags.duration, DEFAULT_WATCH_DURATION_MS),
    minChangedRatio: numberFlag(parsed.flags["min-ratio"], 0.003),
    pixelThreshold: numberFlag(parsed.flags["pixel-threshold"], 0.12),
    maxFrames: numberFlag(parsed.flags["max-frames"], 80),
    viewport,
    fullPage: Boolean(parsed.flags["full-page"]),
    headed: Boolean(parsed.flags.headed),
    channel: parsed.flags.channel,
    verbose: Boolean(parsed.flags.verbose),
    masks,
    rawFrames: rawFrameOptions.enabled,
    rawFps: rawFrameOptions.fps,
    controls
  });

  console.log(`Trace written to ${result.traceDir}`);
  console.log(`Saved ${result.trace.states.length} state(s).`);
  if (result.trace.rawFrames?.length) {
    console.log(`Archived ${result.trace.rawFrames.length} raw frame(s).`);
  }
  console.log(`Review it with: deltaframe review "${result.traceDir}"`);
}

function shouldEnableWatchControls(flags) {
  return Boolean(process.stdin.isTTY) && !flags["no-controls"];
}

async function runReview(parsed) {
  const traceDir = parsed.positionals[0] || await findLatestTraceDir(DEFAULT_TRACE_ROOT);
  if (!traceDir) {
    throw new Error(`No trace directory found under ${DEFAULT_TRACE_ROOT}`);
  }

  await startReviewServer({
    traceDir,
    port: numberFlag(parsed.flags.port, 7799)
  });
}

async function runDesktop(parsed) {
  const python = stringOption(parsed.flags.python);

  if (parsed.flags.list) {
    console.log(JSON.stringify(await listDesktopSources({ python }), null, 2));
    return;
  }

  if (parsed.flags["list-windows"]) {
    console.log(JSON.stringify(await listDesktopWindows({
      python,
      windowTitle: stringOption(parsed.flags["window-title"] || parsed.flags.title)
    }), null, 2));
    return;
  }

  const targetCount = [
    parsed.flags.region !== undefined,
    parsed.flags.monitor !== undefined,
    parsed.flags["window-title"] !== undefined || parsed.flags.title !== undefined
  ].filter(Boolean).length;
  if (targetCount > 1) {
    throw new Error("Choose only one desktop target: --region, --monitor, or --window-title.");
  }

  const result = await watchDesktop({
    name: parsed.flags.name,
    outDir: parsed.flags.out || DEFAULT_TRACE_ROOT,
    durationMs: numberFlag(parsed.flags.duration, 10000),
    ...desktopTimingOptions(parsed.flags),
    minChangedRatio: numberFlag(parsed.flags["min-ratio"], 0.003),
    pixelThreshold: numberFlag(parsed.flags["pixel-threshold"], 0.12),
    maxFrames: numberFlag(parsed.flags["max-frames"], 80),
    region: parsed.flags.region ? parseRegion(parsed.flags.region) : undefined,
    monitorIndex: optionalIntegerFlag(parsed.flags.monitor, "monitor"),
    windowTitle: stringOption(parsed.flags["window-title"] || parsed.flags.title),
    masks: await maskOptions(parsed.flags),
    redactions: await redactionOptions(parsed.flags),
    python
  });

  console.log(`Trace written to ${result.traceDir}`);
  console.log(`Saved ${result.trace.states.length} state(s).`);
  if (result.trace.rawFrames?.length) {
    console.log(`Archived ${result.trace.rawFrames.length} raw frame(s).`);
  }
  console.log(`Review it with: deltaframe review "${result.traceDir}"`);
}

function desktopTimingOptions(flags) {
  if (flags.sparse && (flags["raw-frames"] || flags.fps !== undefined)) {
    throw new Error("Use either --sparse or raw capture flags, not both.");
  }
  const useRawFrames = !flags.sparse;
  const rawFrameOptions = normalizeRawFrameOptions({
    enabled: useRawFrames || flags["raw-frames"],
    fps: flags.fps ?? (useRawFrames && flags.interval === undefined ? DEFAULT_DESKTOP_RAW_FPS : undefined),
    intervalMs: numberFlag(flags.interval, useRawFrames ? Math.round(1000 / DEFAULT_DESKTOP_RAW_FPS) : 500)
  });
  return {
    intervalMs: rawFrameOptions.intervalMs,
    idleMs: numberFlag(flags.idle, rawFrameOptions.enabled ? 0 : 350),
    rawFrames: rawFrameOptions.enabled,
    rawFps: rawFrameOptions.fps,
    cursorFilter: flags["include-cursor-motion"] ? false : true
  };
}

async function runFlow(parsed) {
  const url = parsed.flags.url || parsed.positionals[0];
  const scriptPath = parsed.flags.script || parsed.positionals[1];
  if (!url || !scriptPath) {
    throw new Error("Missing URL or script. Example: deltaframe flow --url http://localhost:3000 --script ./flow.js");
  }

  try {
    const result = await capturePlaywrightFlow({
      url,
      scriptPath,
      name: parsed.flags.name,
      outDir: parsed.flags.out || DEFAULT_TRACE_ROOT,
      viewport: parseViewport(parsed.flags.viewport || "1440x900"),
      fullPage: Boolean(parsed.flags["full-page"]),
      headed: Boolean(parsed.flags.headed),
      channel: parsed.flags.channel,
      timeoutMs: numberFlag(parsed.flags.timeout, 15000),
      pixelThreshold: numberFlag(parsed.flags["pixel-threshold"], 0.12),
      masks: await maskOptions(parsed.flags),
      redactions: await redactionOptions(parsed.flags)
    });
    console.log(`Trace written to ${result.traceDir}`);
    console.log(`Saved ${result.trace.states.length} state(s).`);
    console.log(`Review it with: deltaframe review "${result.traceDir}"`);
  } catch (error) {
    if (error.traceDir) {
      console.error(`DeltaFrame flow trace written to ${error.traceDir}`);
    }
    throw error;
  }
}

async function runSummarize(parsed) {
  const traceDir = parsed.positionals[0] || await findLatestTraceDir(DEFAULT_TRACE_ROOT);
  if (!traceDir) {
    throw new Error(`No trace directory found under ${DEFAULT_TRACE_ROOT}`);
  }

  const trace = await readTrace(traceDir);
  const summaryPath = path.join(traceDir, "summary.md");
  try {
    const summary = await fs.readFile(summaryPath, "utf8");
    console.log(summary);
  } catch {
    console.log(`# ${trace.name}\n\n${trace.states.length} state(s) captured in ${traceDir}.`);
  }
}

async function runCompare(parsed) {
  const [beforeTraceDir, afterTraceDir] = parsed.positionals;
  if (!beforeTraceDir || !afterTraceDir) {
    throw new Error("Missing trace directories. Example: deltaframe compare <before-trace-dir> <after-trace-dir>");
  }

  const comparison = await compareTraces(beforeTraceDir, afterTraceDir, {
    focus: parsed.flags.focus,
    expectation: parsed.flags.expectation || parsed.flags.expectations
  });

  if (parsed.flags.json) {
    console.log(JSON.stringify(comparison, null, 2));
  } else {
    console.log(comparison.markdown);
  }

  const budgets = comparisonBudgets(parsed.flags);
  if (budgets) {
    const evaluation = evaluateTraceComparison(comparison, budgets);
    if (!evaluation.ok) {
      for (const failure of evaluation.failures) {
        console.error(`DeltaFrame baseline failed: ${failure.message}`);
      }
      process.exitCode = 1;
    }
  }
}

async function runDoctor(flags = {}) {
  const checks = [
    ["playwright", "browser capture"],
    ["pixelmatch", "pixel-level image diffs"],
    ["pngjs", "PNG decoding/encoding"]
  ];

  console.log("DeltaFrame doctor");
  console.log(`Node ${process.version}`);

  let ok = true;
  for (const [pkg, use] of checks) {
    const available = await packageAvailable(pkg);
    ok = ok && available;
    console.log(`${available ? "ok " : "no "} ${pkg} - ${use}`);
  }

  if (!ok) {
    console.log("");
    console.log("Install dependencies with: npm install");
    process.exitCode = 1;
    return;
  }

  if (flags.browser) {
    const browserOk = await checkBrowserLaunch(flags.channel);
    if (!browserOk) {
      process.exitCode = 1;
    }
  }

  if (flags.desktop) {
    const desktopOk = await checkDesktopBackend(flags.python);
    if (!desktopOk) {
      process.exitCode = 1;
    }
  }
}

async function checkBrowserLaunch(channel) {
  try {
    const playwright = await loadPackage("playwright");
    const chromium = playwright.chromium || playwright.default?.chromium;
    const browser = await chromium.launch({
      headless: true,
      timeout: 15000,
      ...(channel ? { channel } : {})
    });
    await browser.close();
    console.log(`ok  chromium launch${channel ? ` (${channel})` : ""}`);
    return true;
  } catch (error) {
    console.log(`no  chromium launch - ${firstLine(error.message)}`);
    console.log("    Try: npx playwright install chromium");
    console.log("    On WSL/Ubuntu, also run: sudo npx playwright install-deps chromium");
    return false;
  }
}

async function checkDesktopBackend(python) {
  try {
    const sources = await listDesktopSources({ python: stringOption(python) });
    console.log(`ok  desktop capture backend - ${sources.monitors.length} monitor source(s)`);
    return true;
  } catch (error) {
    console.log(`no  desktop capture backend - ${firstLine(error.message)}`);
    console.log("    Try: python -m pip install mss");
    console.log("    On macOS, grant Screen Recording permission to the Python executable.");
    console.log("    From WSL, use a native host Python via --python if Linux capture cannot see the Windows desktop.");
    return false;
  }
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/)[0];
}

function numberFlag(value, fallback) {
  if (value === undefined || value === true || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a number, got ${value}`);
  }
  return parsed;
}

function optionalIntegerFlag(value, name) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer, got ${value}`);
  }
  return parsed;
}

function comparisonBudgets(flags) {
  if (flags["fail-on-changes"]) {
    return {
      changedStates: 0,
      addedStates: 0,
      removedStates: 0,
      annotationChanges: optionalIntegerFlag(flags["max-annotation-changes"], "max-annotation-changes") ?? 0
    };
  }

  const budgets = {
    changedStates: optionalIntegerFlag(flags["max-changed-states"], "max-changed-states"),
    addedStates: optionalIntegerFlag(flags["max-added-states"], "max-added-states"),
    removedStates: optionalIntegerFlag(flags["max-removed-states"], "max-removed-states"),
    annotationChanges: optionalIntegerFlag(flags["max-annotation-changes"], "max-annotation-changes")
  };
  return Object.values(budgets).some((value) => value !== undefined) ? budgets : null;
}

function stringOption(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}

async function maskOptions(flags) {
  const masks = [];

  if (flags.mask !== undefined || flags.masks !== undefined) {
    masks.push(...normalizeMaskRegions(flags.mask ?? flags.masks, "--mask"));
  }

  if (flags["mask-file"] !== undefined) {
    if (flags["mask-file"] === true || flags["mask-file"] === "") {
      throw new Error("--mask-file requires a path to a JSON file.");
    }
    const maskFile = String(flags["mask-file"]);
    const text = await fs.readFile(maskFile, "utf8");
    masks.push(...normalizeMaskRegions(text, "--mask-file"));
  }

  return masks;
}

async function redactionOptions(flags) {
  const redactions = [];

  if (flags.redact !== undefined || flags.redactions !== undefined) {
    redactions.push(...normalizeMaskRegions(flags.redact ?? flags.redactions, "--redact"));
  }

  if (flags["redact-file"] !== undefined) {
    if (flags["redact-file"] === true || flags["redact-file"] === "") {
      throw new Error("--redact-file requires a path to a JSON file.");
    }
    const redactFile = String(flags["redact-file"]);
    const text = await fs.readFile(redactFile, "utf8");
    redactions.push(...normalizeMaskRegions(text, "--redact-file"));
  }

  return redactions;
}

function printHelp() {
  console.log(`DeltaFrame 0.1.0

Capture meaningful visual state changes from local prototypes.

Usage:
  deltaframe watch --url <url> [options]
  deltaframe desktop [--region x,y,width,height | --monitor n | --window-title text] [options]
  deltaframe flow --url <url> --script <file> [options]
  deltaframe review [trace-dir] [--port 7799]
  deltaframe summarize [trace-dir]
  deltaframe compare <before-trace-dir> <after-trace-dir> [--focus text] [--expectation text]
  deltaframe mcp [--trace-root .deltaframe/traces]
  deltaframe doctor [--browser] [--desktop] [--channel chrome]

Watch options:
  --url <url>                 Local web prototype URL or file URL.
  --name <name>               Human name for the trace.
  --out <dir>                 Trace root directory. Default: .deltaframe/traces
  --duration <ms>             Capture duration. Use 0 until Ctrl+C. Default: 10000
  --interval <ms>             Screenshot sample interval. Default: 100 in raw mode
  --fps <number>              Raw capture fps. Default: 10
  --raw-frames                Archive every sampled screenshot under raw/. Default mode
  --sparse                    Use the older live changed-state sampler.
  --idle <ms>                 Wait after a change before saving. Default: 0, or 350 with --sparse
  --min-ratio <number>        Changed-pixel ratio needed to save. Default: 0.003
  --pixel-threshold <number>  Per-pixel diff threshold. Default: 0.12
  --mask <json>               Mask region(s) ignored by diffing, for example '[{"x":0,"y":0,"width":120,"height":32}]'.
  --mask-file <path>          Read diff mask region(s) from a JSON file.
  --max-frames <number>       Stop after this many saved states. Default: 80
  --viewport <WxH>            Browser viewport. Default: 1440x900
  --channel <name>            Playwright browser channel, for example chrome or msedge.
  --verbose                   Print capture setup details to stderr.
  --full-page                 Capture full-page screenshots.
  --headed                    Show the browser so you can interact manually.
  --no-controls               Disable interactive p/q terminal controls.

Desktop options:
  --list                      List monitors visible to the optional MSS backend.
  --list-windows              List visible windows when supported.
  --region <x,y,w,h>          Capture an absolute screen region.
  --monitor <n>               Capture one MSS monitor index. Defaults to the first real monitor.
  --window-title <text>       Capture a visible window by title substring. Native Windows only.
  --python <path>             Python executable for the MSS backend.
  --fps <number>              Raw desktop capture fps. Default: 5
  --raw-frames                Archive every sampled screenshot under raw/. Default mode
  --sparse                    Use the older live changed-state sampler.
  --include-cursor-motion     Keep small cursor-like desktop changes as keyframe candidates.
  --redact <json>             Redact saved screenshot region(s), for example '[{"x":0,"y":0,"width":300,"height":80}]'.
  --redact-file <path>        Read redaction region(s) from a JSON file.

Flow options:
  --script <file>             ES module exporting default async function or named run function.
  --url <url>                 URL to open before running the script.
  --viewport <WxH>            Browser viewport. Default: 1440x900
  --headed                    Show Chromium while the flow runs.

Compare baseline options:
  --fail-on-changes           Exit non-zero if changed, added, removed, or annotation-changed states are found.
  --max-changed-states <n>    Exit non-zero if changed states exceed n.
  --max-added-states <n>      Exit non-zero if added states exceed n.
  --max-removed-states <n>    Exit non-zero if removed states exceed n.
  --max-annotation-changes <n> Exit non-zero if annotation changes exceed n.

Examples:
  deltaframe watch --url http://localhost:3000 --name landing-flow --headed
  deltaframe watch --url http://localhost:3000 --mask '[{"x":0,"y":0,"width":160,"height":40,"label":"clock"}]'
  deltaframe desktop --region 0,0,1200,800 --name desktop-flow
  deltaframe desktop --monitor 1 --redact '[{"x":0,"y":0,"width":320,"height":120,"label":"account"}]'
  deltaframe flow --url http://localhost:3000 --script ./flows/onboarding.js
  deltaframe review .deltaframe/traces/2026-06-06-landing-flow
  deltaframe compare .deltaframe/traces/before .deltaframe/traces/after --fail-on-changes
  deltaframe mcp --trace-root .deltaframe/traces
`);
}
