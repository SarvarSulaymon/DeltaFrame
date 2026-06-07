import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PNG } from "pngjs";
import { selectRawKeyframes } from "../src/capture/rawFrames.js";

test("selectRawKeyframes skips duplicates and keeps meaningful raw frames", async () => {
  const traceDir = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-raw-"));
  await fs.mkdir(path.join(traceDir, "raw"));
  const rawFrames = [
    await writeRawFrame(traceDir, "raw-000001", whitePng(), 0, "/"),
    await writeRawFrame(traceDir, "raw-000002", whitePng(), 100, "/"),
    await writeRawFrame(traceDir, "raw-000003", blackPng(), 200, "/"),
    await writeRawFrame(traceDir, "raw-000004", blackPng(), 300, "/settings"),
    await writeRawFrame(traceDir, "raw-000005", blackPng(), 400, "/settings")
  ];

  const selected = await selectRawKeyframes({
    traceDir,
    rawFrames,
    maxKeyframes: 10,
    minChangedRatio: 0.25,
    pixelThreshold: 0
  });

  assert.deepEqual(selected.map((entry) => entry.frame.id), [
    "raw-000001",
    "raw-000003",
    "raw-000004",
    "raw-000005"
  ]);
  assert.deepEqual(selected[0].selectionReasons, ["first-frame"]);
  assert.deepEqual(selected[1].selectionReasons, ["visual-change"]);
  assert.deepEqual(selected[2].selectionReasons, ["route-change"]);
  assert.deepEqual(selected[3].selectionReasons, ["last-frame"]);
  assert.equal(selected[1].skippedRawFrameCount, 1);
});

test("selectRawKeyframes respects max keyframes while reserving the last frame", async () => {
  const traceDir = await fs.mkdtemp(path.join(os.tmpdir(), "deltaframe-raw-limit-"));
  await fs.mkdir(path.join(traceDir, "raw"));
  const rawFrames = [
    await writeRawFrame(traceDir, "raw-000001", whitePng(), 0, "/"),
    await writeRawFrame(traceDir, "raw-000002", blackPng(), 100, "/"),
    await writeRawFrame(traceDir, "raw-000003", whitePng(), 200, "/"),
    await writeRawFrame(traceDir, "raw-000004", blackPng(), 300, "/")
  ];

  const selected = await selectRawKeyframes({
    traceDir,
    rawFrames,
    maxKeyframes: 2,
    minChangedRatio: 0.25,
    pixelThreshold: 0
  });

  assert.deepEqual(selected.map((entry) => entry.frame.id), [
    "raw-000001",
    "raw-000004"
  ]);
  assert.equal(selected[1].selectionReasons.includes("last-frame"), true);
});

async function writeRawFrame(traceDir, id, buffer, timestampMs, route) {
  const image = `raw/${id}.png`;
  await fs.writeFile(path.join(traceDir, image), buffer);
  return {
    id,
    timestampMs,
    image,
    reason: "sample",
    url: `http://localhost:3000${route}`,
    route
  };
}

function whitePng() {
  return pngBuffer([
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255]
  ]);
}

function blackPng() {
  return pngBuffer([
    [0, 0, 0, 255],
    [0, 0, 0, 255],
    [0, 0, 0, 255],
    [0, 0, 0, 255]
  ]);
}

function pngBuffer(pixels) {
  const png = new PNG({ width: 2, height: 2 });
  pixels.forEach((pixel, index) => {
    const offset = index << 2;
    png.data[offset] = pixel[0];
    png.data[offset + 1] = pixel[1];
    png.data[offset + 2] = pixel[2];
    png.data[offset + 3] = pixel[3];
  });
  return PNG.sync.write(png);
}
