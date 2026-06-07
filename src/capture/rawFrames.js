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
    async record({ page, buffer, reason, url: inputUrl, route: inputRoute, metadata }) {
      const index = trace.rawFrames.length + 1;
      const id = `raw-${padNumber(index, 6)}`;
      const url = inputUrl || page?.url?.() || trace.source?.url || "";
      const route = inputRoute ?? routeForUrl(url);
      const imageName = `${id}-${slugify(reason || "sample", "sample")}.png`;
      const image = `raw/${imageName}`;

      await fs.writeFile(path.join(traceDir, image), buffer);

      const frame = {
        id,
        timestampMs: Date.now() - startedAt,
        image,
        reason: reason || "sample",
        url,
        ...(route ? { route } : {}),
        ...(metadata ? { metadata } : {})
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
  masks = [],
  noiseFilters = true,
  minChangedPixels = 48,
  maxUnstableRatio,
  stableFrameLookahead = 1,
  cursorFilter = false,
  cursorMaxChangedRatio = 0.002,
  cursorMaxBoxWidth = 96,
  cursorMaxBoxHeight = 96
}) {
  const frames = rawFrames || [];
  if (!frames.length) return [];

  const limit = Math.max(1, Math.floor(Number(maxKeyframes) || 1));
  const first = frames[0];
  const bufferCache = new Map();
  const readFrameBuffer = (frame) => readRawFrame(traceDir, frame, bufferCache);
  const firstBuffer = await readFrameBuffer(first);
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
    const buffer = await readFrameBuffer(frame);
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

    const protectedChange = selectionReasons.includes("route-change") || selectionReasons.includes("last-frame");
    const ordinaryVisualChange = selectionReasons.length === 1 && selectionReasons[0] === "visual-change";
    if (noiseFilters && ordinaryVisualChange) {
      const noiseReason = await classifyVisualNoise({
        frames,
        index,
        buffer,
        comparison,
        lastSelected,
        readFrameBuffer,
        minChangedRatio,
        pixelThreshold,
        masks,
        minChangedPixels,
        stableFrameLookahead,
        maxUnstableRatio: maxUnstableRatio ?? minChangedRatio,
        cursorFilter,
        cursorMaxChangedRatio,
        cursorMaxBoxWidth,
        cursorMaxBoxHeight
      });
      if (noiseReason && !protectedChange) {
        skippedRawFrameCount += 1;
        continue;
      }
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

async function classifyVisualNoise({
  frames,
  index,
  buffer,
  comparison,
  lastSelected,
  readFrameBuffer,
  minChangedRatio,
  pixelThreshold,
  masks,
  minChangedPixels,
  stableFrameLookahead,
  maxUnstableRatio,
  cursorFilter,
  cursorMaxChangedRatio,
  cursorMaxBoxWidth,
  cursorMaxBoxHeight
}) {
  if (comparison.changedPixels < minChangedPixels) {
    return "tiny-change";
  }

  if (cursorFilter && isCursorLikeChange(comparison, {
    cursorMaxChangedRatio,
    cursorMaxBoxWidth,
    cursorMaxBoxHeight
  })) {
    return "cursor-like-change";
  }

  if (stableFrameLookahead <= 0) {
    return null;
  }

  let checked = 0;
  for (let offset = 1; offset <= stableFrameLookahead && index + offset < frames.length; offset += 1) {
    const next = frames[index + offset];
    const nextBuffer = await readFrameBuffer(next);
    const nextVsCandidate = await diffPngBuffers(buffer, nextBuffer, {
      pixelThreshold,
      masks
    });
    const nextVsLastSelected = await diffPngBuffers(lastSelected.buffer, nextBuffer, {
      pixelThreshold,
      masks
    });

    checked += 1;
    if (nextVsCandidate.ratio > maxUnstableRatio || nextVsLastSelected.ratio < minChangedRatio) {
      return "unstable-change";
    }
  }

  return checked > 0 ? null : "unconfirmed-change";
}

function isCursorLikeChange(comparison, options) {
  const bounds = comparison.changedBounds;
  if (!bounds) {
    return false;
  }
  return comparison.ratio <= options.cursorMaxChangedRatio &&
    bounds.width <= options.cursorMaxBoxWidth &&
    bounds.height <= options.cursorMaxBoxHeight;
}

function normalizeFps(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const fps = Number(value);
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`fps must be a positive number, got ${value}`);
  }
  return fps;
}

function routeForUrl(url) {
  if (!url || !/^https?:|^file:/i.test(url)) {
    return undefined;
  }
  return routeFromUrl(url);
}

async function readRawFrame(traceDir, frame, cache) {
  if (cache?.has(frame.id)) {
    return cache.get(frame.id);
  }
  const buffer = await fs.readFile(path.join(traceDir, frame.image));
  cache?.set(frame.id, buffer);
  return buffer;
}
