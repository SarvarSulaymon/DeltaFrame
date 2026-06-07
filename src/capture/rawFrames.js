import fs from "node:fs/promises";
import path from "node:path";
import { diffPngBuffers } from "../diff/imageDiff.js";
import { padNumber, routeFromUrl, slugify } from "../utils/format.js";

export function normalizeRawFrameOptions(options = {}) {
  const fps = normalizeFps(options.fps);
  const enabled = Boolean(options.enabled || fps !== undefined);
  const intervalMs = fps !== undefined
    ? Math.max(1, Math.round(1000 / fps))
    : options.intervalMs;

  return {
    enabled,
    ...(fps !== undefined ? { fps } : {}),
    intervalMs
  };
}

export async function createRawFrameRecorder({ traceDir, trace, startedAt, options }) {
  const rawDir = path.join(traceDir, "raw");
  await fs.mkdir(rawDir, { recursive: true });
  trace.settings = trace.settings || {};
  trace.rawFrames = [];
  trace.settings.rawFrames = {
    enabled: true,
    directory: "raw",
    intervalMs: options.intervalMs,
    ...(options.fps !== undefined ? { fps: options.fps } : {})
  };

  return {
    async record({ page, buffer, reason }) {
      const index = trace.rawFrames.length + 1;
      const id = `raw-${padNumber(index, 6)}`;
      const url = page.url();
      const route = routeFromUrl(url);
      const imageName = `${id}-${slugify(reason || "sample", "sample")}.png`;
      const image = `raw/${imageName}`;

      await fs.writeFile(path.join(traceDir, image), buffer);

      const frame = {
        id,
        timestampMs: Date.now() - startedAt,
        image,
        reason: reason || "sample",
        url,
        ...(route ? { route } : {})
      };
      trace.rawFrames.push(frame);
      return frame;
    }
  };
}

export async function selectRawKeyframes({
  traceDir,
  rawFrames,
  maxKeyframes = 80,
  minChangedRatio = 0.003,
  pixelThreshold = 0.12,
  masks = []
}) {
  const frames = rawFrames || [];
  if (!frames.length) return [];

  const limit = Math.max(1, Math.floor(Number(maxKeyframes) || 1));
  const first = frames[0];
  const firstBuffer = await readRawFrame(traceDir, first);
  const selected = [{
    frame: first,
    buffer: firstBuffer,
    comparison: undefined,
    selectionReasons: ["first-frame"],
    skippedRawFrameCount: 0
  }];

  let lastSelected = selected[0];
  let skippedRawFrameCount = 0;

  for (let index = 1; index < frames.length; index += 1) {
    const frame = frames[index];
    const isLast = index === frames.length - 1;
    const buffer = await readRawFrame(traceDir, frame);
    const comparison = await diffPngBuffers(lastSelected.buffer, buffer, {
      pixelThreshold,
      masks
    });
    const selectionReasons = [];
    const previousRoute = lastSelected.frame.route || "";
    const currentRoute = frame.route || "";

    if (currentRoute && currentRoute !== previousRoute) {
      selectionReasons.push("route-change");
    }
    if (comparison.ratio >= minChangedRatio) {
      selectionReasons.push("visual-change");
    }
    if (isLast) {
      selectionReasons.push("last-frame");
    }

    if (!selectionReasons.length) {
      skippedRawFrameCount += 1;
      continue;
    }

    if (!isLast && selected.length >= Math.max(1, limit - 1)) {
      skippedRawFrameCount += 1;
      continue;
    }

    if (isLast && selected.some((entry) => entry.frame.id === frame.id)) {
      continue;
    }

    const entry = {
      frame,
      buffer,
      comparison,
      selectionReasons: [...new Set(selectionReasons)],
      skippedRawFrameCount
    };
    selected.push(entry);
    lastSelected = entry;
    skippedRawFrameCount = 0;

    if (selected.length >= limit && !isLast) {
      skippedRawFrameCount += 1;
    }
  }

  return selected.slice(0, limit);
}

function normalizeFps(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const fps = Number(value);
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`fps must be a positive number, got ${value}`);
  }
  return fps;
}

async function readRawFrame(traceDir, frame) {
  return fs.readFile(path.join(traceDir, frame.image));
}
