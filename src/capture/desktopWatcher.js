import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeMaskRegions } from "../diff/masks.js";
import { diffPngBuffers } from "../diff/imageDiff.js";
import { createTraceDir, writeSummary, writeTrace } from "../trace/store.js";
import { padNumber, sleep, slugify } from "../utils/format.js";
import { applyRedactionsToPngBuffer } from "./redaction.js";

const BACKEND_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "mss_backend.py");

export async function listDesktopSources(options = {}) {
  return runBackend(["list"], options);
}

export async function listDesktopWindows(options = {}) {
  const args = ["windows"];
  if (options.windowTitle) {
    args.push("--title", options.windowTitle);
  }
  return runBackend(args, options);
}

export async function captureDesktopFrame(options = {}) {
  const args = ["capture"];
  if (options.windowTitle) {
    args.push("--window-title", options.windowTitle);
  } else if (options.region) {
    args.push("--region", regionToArg(options.region));
  } else if (options.monitorIndex !== undefined) {
    args.push("--monitor", String(options.monitorIndex));
  }

  const result = await runBackend(args, options);
  let buffer = Buffer.from(result.png, "base64");
  const redactions = normalizeMaskRegions(options.redactions);
  if (redactions.length) {
    buffer = await applyRedactionsToPngBuffer(buffer, redactions);
  }
  return {
    buffer,
    metadata: {
      backend: result.backend,
      platform: result.platform,
      mode: result.mode,
      monitorIndex: result.monitorIndex ?? null,
      region: result.region,
      window: result.window || null
    }
  };
}

export async function watchDesktop(options = {}) {
  const masks = normalizeMaskRegions(options.masks);
  const redactions = normalizeMaskRegions(options.redactions);
  const startedAt = Date.now();
  const traceDir = await createTraceDir({
    outDir: options.outDir,
    name: options.name || desktopTraceName(options)
  });

  const firstFrame = await captureDesktopFrame({ ...options, redactions });
  const trace = {
    version: "0.1.0",
    name: options.name || desktopTraceName(options),
    createdAt: new Date(startedAt).toISOString(),
    source: {
      type: "desktop",
      url: desktopSourceUrl(options, firstFrame.metadata),
      mode: firstFrame.metadata.mode,
      backend: firstFrame.metadata.backend,
      platform: firstFrame.metadata.platform,
      monitorIndex: firstFrame.metadata.monitorIndex,
      region: firstFrame.metadata.region,
      ...(firstFrame.metadata.window ? { window: firstFrame.metadata.window } : {})
    },
    settings: {
      intervalMs: options.intervalMs,
      idleMs: options.idleMs,
      durationMs: options.durationMs,
      minChangedRatio: options.minChangedRatio,
      pixelThreshold: options.pixelThreshold,
      maxFrames: options.maxFrames,
      ...(masks.length > 0 ? { masks } : {}),
      ...(redactions.length > 0 ? { redactions } : {})
    },
    states: []
  };

  let lastSaved = await saveDesktopState({
    trace,
    traceDir,
    label: "initial",
    buffer: firstFrame.buffer,
    metadata: firstFrame.metadata,
    startedAt
  });

  while (Date.now() - startedAt < options.durationMs && trace.states.length < options.maxFrames) {
    await sleep(options.intervalMs);

    const candidate = await captureDesktopFrame({ ...options, redactions });
    const candidateDiff = await diffPngBuffers(lastSaved.buffer, candidate.buffer, {
      pixelThreshold: options.pixelThreshold,
      masks
    });

    if (candidateDiff.ratio < options.minChangedRatio) {
      continue;
    }

    await sleep(options.idleMs);
    const stable = await captureDesktopFrame({ ...options, redactions });
    const stableDiff = await diffPngBuffers(lastSaved.buffer, stable.buffer, {
      pixelThreshold: options.pixelThreshold,
      masks
    });

    if (stableDiff.ratio < options.minChangedRatio) {
      continue;
    }

    lastSaved = await saveDesktopState({
      trace,
      traceDir,
      label: `changed-${padNumber(Date.now() - startedAt, 6)}ms`,
      buffer: stable.buffer,
      metadata: stable.metadata,
      previous: lastSaved,
      comparison: stableDiff,
      startedAt
    });
  }

  await writeTrace(traceDir, trace);
  await writeSummary(traceDir, trace);
  return { traceDir, trace };
}

async function saveDesktopState(input) {
  const id = padNumber(input.trace.states.length + 1);
  const imageName = `${id}-${slugify(input.label, "state")}.png`;
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

  const state = {
    id,
    label: input.label,
    timestampMs: Date.now() - input.startedAt,
    image: `frames/${imageName}`,
    diffFromPrevious,
    metrics,
    region: input.metadata.region,
    ...(input.metadata.window ? { window: input.metadata.window } : {})
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

function regionToArg(region) {
  if (typeof region === "string") return region;
  return [region.x, region.y, region.width, region.height].join(",");
}

function desktopTraceName(options) {
  if (options.windowTitle) return `window-${options.windowTitle}`;
  if (options.region) return "desktop-region";
  if (options.monitorIndex !== undefined) return `monitor-${options.monitorIndex}`;
  return "desktop";
}

function desktopSourceUrl(options, metadata) {
  if (options.windowTitle) return `desktop://window/${encodeURIComponent(options.windowTitle)}`;
  if (options.region) return `desktop://region/${regionToArg(options.region)}`;
  if (metadata.monitorIndex !== null && metadata.monitorIndex !== undefined) {
    return `desktop://monitor/${metadata.monitorIndex}`;
  }
  return "desktop://screen";
}

async function runBackend(args, options = {}) {
  const errors = [];
  for (const command of pythonCommands(options.python)) {
    try {
      return await runBackendCommand(command, args);
    } catch (error) {
      errors.push(error.message);
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  throw new Error(`Could not start Python for desktop capture. Tried: ${errors.join("; ")}`);
}

function pythonCommands(python) {
  if (python) {
    return [{ executable: python, prefixArgs: [] }];
  }
  if (process.platform === "win32") {
    return [
      { executable: "py", prefixArgs: ["-3"] },
      { executable: "python", prefixArgs: [] },
      { executable: "python3", prefixArgs: [] }
    ];
  }
  return [
    { executable: "python3", prefixArgs: [] },
    { executable: "python", prefixArgs: [] }
  ];
}

function runBackendCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, [...command.prefixArgs, BACKEND_SCRIPT, ...args], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error((stderr || stdout || `Desktop backend exited with code ${code}`).trim()));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (result.ok === false) {
          reject(new Error(result.error || "Desktop backend failed."));
          return;
        }
        resolve(result);
      } catch (error) {
        reject(new Error(`Desktop backend returned invalid JSON: ${error.message}`));
      }
    });
  });
}
