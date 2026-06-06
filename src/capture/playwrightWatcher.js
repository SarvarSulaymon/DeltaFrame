import fs from "node:fs/promises";
import path from "node:path";
import { groupIssueEvents, issueEventsFromState } from "../diagnostics/issues.js";
import { diffPngBuffers } from "../diff/imageDiff.js";
import { normalizeMaskRegions } from "../diff/masks.js";
import { createTraceDir, writeSummary, writeTrace } from "../trace/store.js";
import { loadPackage } from "../utils/deps.js";
import { labelWithRoute, padNumber, routeFromUrl, sleep, slugify } from "../utils/format.js";

export async function watchWeb(options) {
  const log = options.verbose ? (message) => console.error(`[deltaframe] ${message}`) : () => {};
  const masks = normalizeMaskRegions(options.masks);
  log("loading Playwright");
  const playwright = await loadPackage("playwright");
  const chromium = playwright.chromium || playwright.default?.chromium;
  if (!chromium) {
    throw new Error("Could not load Playwright chromium.");
  }

  log("creating trace directory");
  const traceDir = await createTraceDir({
    outDir: options.outDir,
    name: options.name || inferNameFromUrl(options.url)
  });

  log(`trace directory: ${traceDir}`);
  log("launching browser");
  const browser = await launchBrowser(chromium, options);
  log("browser launched");
  const context = await browser.newContext({
    viewport: options.viewport,
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const consoleEvents = [];
  const networkEvents = [];

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

  const startedAt = Date.now();
  const trace = {
    version: "0.1.0",
    name: options.name || inferNameFromUrl(options.url),
    createdAt: new Date(startedAt).toISOString(),
    source: {
      type: "web",
      url: options.url,
      viewport: options.viewport,
      fullPage: Boolean(options.fullPage)
    },
    settings: {
      intervalMs: options.intervalMs,
      idleMs: options.idleMs,
      durationMs: options.durationMs,
      minChangedRatio: options.minChangedRatio,
      pixelThreshold: options.pixelThreshold,
      maxFrames: options.maxFrames,
      ...(masks.length > 0 ? { masks } : {})
    },
    states: []
  };

  let stop = false;
  const stopHandler = () => {
    stop = true;
  };
  process.once("SIGINT", stopHandler);

  try {
    log(`opening ${options.url}`);
    await goto(page, options.url);
    trace.source.finalUrl = page.url();

    log("capturing initial state");
    let lastSaved = await saveState({
      trace,
      traceDir,
      page,
      label: "initial",
      buffer: await capture(page, options),
      startedAt,
      consoleEvents,
      consoleCursor: 0,
      networkEvents,
      networkCursor: 0
    });

    let consoleCursor = consoleEvents.length;
    let networkCursor = networkEvents.length;

    while (!stop) {
      if (options.durationMs > 0 && Date.now() - startedAt >= options.durationMs) {
        break;
      }
      if (trace.states.length >= options.maxFrames) {
        break;
      }

      await sleep(options.intervalMs);
      const candidate = await capture(page, options);
      const candidateDiff = await diffPngBuffers(lastSaved.buffer, candidate, {
        pixelThreshold: options.pixelThreshold,
        masks
      });

      if (candidateDiff.ratio < options.minChangedRatio) {
        continue;
      }

      await sleep(options.idleMs);
      const stable = await capture(page, options);
      const stableDiff = await diffPngBuffers(lastSaved.buffer, stable, {
        pixelThreshold: options.pixelThreshold,
        masks
      });

      if (stableDiff.ratio < options.minChangedRatio) {
        continue;
      }

      const label = `changed-${padNumber(Date.now() - startedAt, 6)}ms`;
      log(`saving ${label} (${(stableDiff.ratio * 100).toFixed(3)}% changed)`);
      lastSaved = await saveState({
        trace,
        traceDir,
        page,
        label,
        buffer: stable,
        previous: lastSaved,
        comparison: stableDiff,
        startedAt,
        consoleEvents,
        consoleCursor,
        networkEvents,
        networkCursor
      });
      consoleCursor = consoleEvents.length;
      networkCursor = networkEvents.length;
    }

    log("writing final trace");
    await writeTrace(traceDir, trace);
    await writeSummary(traceDir, trace);

    return { traceDir, trace };
  } finally {
    process.removeListener("SIGINT", stopHandler);
    await browser.close().catch(() => {});
  }
}

async function goto(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await sleep(100);
}

async function launchBrowser(chromium, options) {
  const base = {
    headless: !options.headed,
    timeout: 15000
  };

  if (options.channel) {
    return chromium.launch({ ...base, channel: options.channel });
  }

  try {
    return await chromium.launch(base);
  } catch (error) {
    if (!looksLikeMissingBrowser(error)) {
      throw error;
    }

    const fallbacks = process.platform === "win32"
      ? ["chrome", "msedge"]
      : ["chrome"];

    for (const channel of fallbacks) {
      try {
        return await chromium.launch({ ...base, channel });
      } catch {
        // Try the next locally installed browser channel.
      }
    }

    throw new Error(
      "Could not launch Chromium. Run \"npx playwright install chromium\" " +
      "or pass an installed browser channel with \"--channel chrome\" or \"--channel msedge\".\n" +
      error.message
    );
  }
}

function looksLikeMissingBrowser(error) {
  const text = String(error?.message || error);
  return text.includes("Executable doesn't exist") || text.includes("playwright install");
}

async function capture(page, options) {
  return page.screenshot({
    type: "png",
    fullPage: Boolean(options.fullPage),
    animations: "disabled",
    caret: "hide"
  });
}

async function saveState(input) {
  const id = padNumber(input.trace.states.length + 1);
  const url = input.page.url();
  const route = routeFromUrl(url);
  const label = labelWithRoute(input.label, url);
  const imageName = `${id}-${slugify(label, "state")}.png`;
  const imagePath = path.join(input.traceDir, "frames", imageName);
  await fs.writeFile(imagePath, input.buffer);

  let diffFromPrevious;
  let metrics;

  if (input.previous && input.comparison) {
    const diffName = `${input.previous.id}-${id}.png`;
    const diffPath = path.join(input.traceDir, "diffs", diffName);
    await fs.writeFile(diffPath, input.comparison.diffBuffer);
    diffFromPrevious = `diffs/${diffName}`;
    metrics = {
      changedPixels: input.comparison.changedPixels,
      totalPixels: input.comparison.totalPixels,
      ratio: input.comparison.ratio,
      width: input.comparison.width,
      height: input.comparison.height,
      dimensionsChanged: input.comparison.dimensionsChanged
    };
  }

  const console = input.consoleEvents
    .slice(input.consoleCursor)
    .map((event) => ({
      ...event,
      timestampMs: event.timestampMs - input.startedAt
    }));
  const network = input.networkEvents
    .slice(input.networkCursor)
    .map((event) => ({
      ...event,
      timestampMs: event.timestampMs - input.startedAt
    }));
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

  return {
    id,
    state,
    buffer: input.buffer
  };
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
    return url.hostname === "localhost"
      ? `${url.hostname}${url.port ? `-${url.port}` : ""}${url.pathname}`
      : `${url.hostname}${url.pathname}`;
  } catch {
    return "trace";
  }
}
