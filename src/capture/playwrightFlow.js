import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { groupIssueEvents, issueEventsFromState } from "../diagnostics/issues.js";
import { diffPngBuffers } from "../diff/imageDiff.js";
import { normalizeMaskRegions } from "../diff/masks.js";
import { createTraceDir, writeSummary, writeTrace } from "../trace/store.js";
import { loadPackage } from "../utils/deps.js";
import { labelWithRoute, padNumber, routeFromUrl, sleep, slugify } from "../utils/format.js";
import { applyRedactionsToPngBuffer } from "./redaction.js";

export async function capturePlaywrightFlow(options) {
  if (!options.url) {
    throw new Error("capturePlaywrightFlow requires a url.");
  }
  if (!options.scriptPath) {
    throw new Error("capturePlaywrightFlow requires a scriptPath.");
  }

  const masks = normalizeMaskRegions(options.masks);
  const redactions = normalizeMaskRegions(options.redactions);
  const playwright = await loadPackage("playwright");
  const chromium = playwright.chromium || playwright.default?.chromium;
  if (!chromium) {
    throw new Error("Could not load Playwright chromium.");
  }

  const startedAt = Date.now();
  const traceDir = await createTraceDir({
    outDir: options.outDir,
    name: options.name || inferNameFromUrl(options.url)
  });
  const browser = await launchBrowser(chromium, options);
  const context = await browser.newContext({
    viewport: options.viewport,
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const consoleEvents = [];
  const networkEvents = [];

  collectDiagnostics(page, consoleEvents, networkEvents);

  const trace = {
    version: "0.1.0",
    name: options.name || inferNameFromUrl(options.url),
    createdAt: new Date(startedAt).toISOString(),
    source: {
      type: "playwright-flow",
      url: options.url,
      scriptPath: path.resolve(options.scriptPath),
      viewport: options.viewport,
      fullPage: Boolean(options.fullPage)
    },
    settings: {
      pixelThreshold: options.pixelThreshold,
      ...(masks.length > 0 ? { masks } : {}),
      ...(redactions.length > 0 ? { redactions } : {})
    },
    states: []
  };
  let lastSaved;
  let consoleCursor = 0;
  let networkCursor = 0;

  async function capture(label = "step") {
    const saved = await saveFlowState({
      trace,
      traceDir,
      page,
      label,
      buffer: await capturePage(page, options, redactions),
      previous: lastSaved,
      startedAt,
      consoleEvents,
      consoleCursor,
      networkEvents,
      networkCursor,
      masks,
      pixelThreshold: options.pixelThreshold
    });
    lastSaved = saved;
    consoleCursor = consoleEvents.length;
    networkCursor = networkEvents.length;
    return saved.state;
  }

  try {
    await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs || 15000 });
    await sleep(100);
    trace.source.finalUrl = page.url();
    await capture("initial");

    const runner = await loadFlowRunner(options.scriptPath);
    await runner({
      page,
      context,
      browser,
      capture,
      traceDir,
      trace
    });
    await capture("final");
    await writeTrace(traceDir, trace);
    await writeSummary(traceDir, trace);
    return { traceDir, trace };
  } catch (error) {
    try {
      if (page && !page.isClosed()) {
        await capture("failure");
      }
      await writeTrace(traceDir, trace);
      await writeSummary(traceDir, trace);
    } catch {
      // Preserve the original flow failure.
    }
    error.traceDir = traceDir;
    throw error;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function loadFlowRunner(scriptPath) {
  const moduleUrl = pathToFileURL(path.resolve(scriptPath)).href;
  const loaded = await import(`${moduleUrl}?t=${Date.now()}`);
  const runner = loaded.default || loaded.run;
  if (typeof runner !== "function") {
    throw new Error("Flow script must export a default function or named run function.");
  }
  return runner;
}

function collectDiagnostics(page, consoleEvents, networkEvents) {
  page.on("console", (message) => {
    const type = message.type();
    if (type === "error" || type === "warning") {
      const location = message.location();
      consoleEvents.push({
        type,
        text: message.text(),
        ...(location?.url ? { url: location.url } : {}),
        timestampMs: Date.now()
      });
    }
  });

  page.on("pageerror", (error) => {
    consoleEvents.push({
      type: "pageerror",
      text: error.message,
      url: page.url(),
      timestampMs: Date.now()
    });
  });

  page.on("requestfailed", (request) => {
    networkEvents.push({
      type: "requestfailed",
      message: request.failure()?.errorText || "Request failed",
      url: request.url(),
      method: request.method(),
      timestampMs: Date.now()
    });
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    networkEvents.push({
      type: "http",
      message: `HTTP ${status} ${response.statusText()}`.trim(),
      url: response.url(),
      method: response.request().method(),
      status,
      timestampMs: Date.now()
    });
  });
}

async function saveFlowState(input) {
  const id = padNumber(input.trace.states.length + 1);
  const url = input.page.url();
  const route = routeFromUrl(url);
  const label = labelWithRoute(input.label, url);
  const imageName = `${id}-${slugify(label, "state")}.png`;
  const imagePath = path.join(input.traceDir, "frames", imageName);
  await fs.writeFile(imagePath, input.buffer);

  let diffFromPrevious;
  let metrics;
  if (input.previous) {
    const comparison = await diffPngBuffers(input.previous.buffer, input.buffer, {
      pixelThreshold: input.pixelThreshold,
      masks: input.masks
    });
    const diffName = `${input.previous.id}-${id}.png`;
    const diffPath = path.join(input.traceDir, "diffs", diffName);
    await fs.writeFile(diffPath, comparison.diffBuffer);
    diffFromPrevious = `diffs/${diffName}`;
    metrics = {
      changedPixels: comparison.changedPixels,
      totalPixels: comparison.totalPixels,
      ratio: comparison.ratio,
      width: comparison.width,
      height: comparison.height,
      dimensionsChanged: comparison.dimensionsChanged
    };
  }

  const console = input.consoleEvents
    .slice(input.consoleCursor)
    .map((event) => ({ ...event, timestampMs: event.timestampMs - input.startedAt }));
  const network = input.networkEvents
    .slice(input.networkCursor)
    .map((event) => ({ ...event, timestampMs: event.timestampMs - input.startedAt }));
  const issues = groupIssueEvents(issueEventsFromState({ console, network }));
  const state = {
    id,
    label,
    ...(route ? { route } : {}),
    timestampMs: Date.now() - input.startedAt,
    url,
    title: await safeTitle(input.page),
    image: `frames/${imageName}`,
    diffFromPrevious,
    metrics,
    console,
    network,
    issues
  };
  input.trace.states.push(state);
  await writeTrace(input.traceDir, input.trace);
  await writeSummary(input.traceDir, input.trace);
  return { id, state, buffer: input.buffer };
}

async function capturePage(page, options, redactions) {
  let buffer = await page.screenshot({
    type: "png",
    fullPage: Boolean(options.fullPage),
    animations: "disabled",
    caret: "hide"
  });
  if (redactions.length) {
    buffer = await applyRedactionsToPngBuffer(buffer, redactions);
  }
  return buffer;
}

async function launchBrowser(chromium, options) {
  const base = {
    headless: !options.headed,
    timeout: 15000
  };
  if (options.channel) {
    return chromium.launch({ ...base, channel: options.channel });
  }
  return chromium.launch(base);
}

async function safeTitle(page) {
  try {
    return await page.title();
  } catch {
    return "";
  }
}

function inferNameFromUrl(value) {
  try {
    const url = new URL(value);
    return `flow-${url.hostname}${url.port ? `-${url.port}` : ""}${url.pathname}`;
  } catch {
    return "playwright-flow";
  }
}
