import fs from "node:fs/promises";
import path from "node:path";
import { watchWeb } from "./capture/playwrightWatcher.js";
import { normalizeMaskRegions } from "./diff/masks.js";
import { startMcpServer } from "./mcp/server.js";
import { startReviewServer } from "./review/server.js";
import { findLatestTraceDir, readTrace } from "./trace/store.js";
import { parseArgs } from "./utils/args.js";
import { loadPackage, packageAvailable } from "./utils/deps.js";
import { parseViewport } from "./utils/format.js";

const DEFAULT_TRACE_ROOT = ".deltaframe/traces";

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
  const result = await watchWeb({
    url,
    name: parsed.flags.name,
    outDir: parsed.flags.out || DEFAULT_TRACE_ROOT,
    intervalMs: numberFlag(parsed.flags.interval, 200),
    idleMs: numberFlag(parsed.flags.idle, 350),
    durationMs: numberFlag(parsed.flags.duration, 15000),
    minChangedRatio: numberFlag(parsed.flags["min-ratio"], 0.003),
    pixelThreshold: numberFlag(parsed.flags["pixel-threshold"], 0.12),
    maxFrames: numberFlag(parsed.flags["max-frames"], 80),
    viewport,
    fullPage: Boolean(parsed.flags["full-page"]),
    headed: Boolean(parsed.flags.headed),
    channel: parsed.flags.channel,
    verbose: Boolean(parsed.flags.verbose),
    masks
  });

  console.log(`Trace written to ${result.traceDir}`);
  console.log(`Saved ${result.trace.states.length} state(s).`);
  console.log(`Review it with: deltaframe review "${result.traceDir}"`);
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

function printHelp() {
  console.log(`DeltaFrame 0.1.0

Capture meaningful visual state changes from local prototypes.

Usage:
  deltaframe watch --url <url> [options]
  deltaframe review [trace-dir] [--port 7799]
  deltaframe summarize [trace-dir]
  deltaframe mcp [--trace-root .deltaframe/traces]
  deltaframe doctor [--browser] [--channel chrome]

Watch options:
  --url <url>                 Local web prototype URL or file URL.
  --name <name>               Human name for the trace.
  --out <dir>                 Trace root directory. Default: .deltaframe/traces
  --duration <ms>             Capture duration. Use 0 until Ctrl+C. Default: 15000
  --interval <ms>             Screenshot sample interval. Default: 200
  --idle <ms>                 Wait after a change before saving. Default: 350
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

Examples:
  deltaframe watch --url http://localhost:3000 --name landing-flow --headed
  deltaframe watch --url http://localhost:3000 --mask '[{"x":0,"y":0,"width":160,"height":40,"label":"clock"}]'
  deltaframe review .deltaframe/traces/2026-06-06-landing-flow
  deltaframe mcp --trace-root .deltaframe/traces
`);
}
