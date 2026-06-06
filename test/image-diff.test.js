import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import { diffPngBuffers } from "../src/diff/imageDiff.js";

test("diffPngBuffers reports no changes for identical tiny PNGs", async () => {
  const before = pngBuffer(2, 2, [
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255]
  ]);

  const diff = await diffPngBuffers(before, before);

  assert.equal(diff.changedPixels, 0);
  assert.equal(diff.totalPixels, 4);
  assert.equal(diff.ratio, 0);
  assert.equal(diff.dimensionsChanged, false);
  assert.equal(PNG.sync.read(diff.diffBuffer).width, 2);
});

test("diffPngBuffers counts changed pixels", async () => {
  const before = pngBuffer(2, 2, [
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255]
  ]);
  const after = pngBuffer(2, 2, [
    [255, 255, 255, 255],
    [0, 0, 0, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255]
  ]);

  const diff = await diffPngBuffers(before, after, { pixelThreshold: 0 });

  assert.equal(diff.changedPixels, 1);
  assert.equal(diff.totalPixels, 4);
  assert.equal(diff.ratio, 0.25);
  assert.equal(diff.dimensionsChanged, false);
});

test("diffPngBuffers normalizes dimension changes", async () => {
  const before = pngBuffer(1, 1, [[255, 255, 255, 255]]);
  const after = pngBuffer(2, 1, [
    [255, 255, 255, 255],
    [255, 255, 255, 255]
  ]);

  const diff = await diffPngBuffers(before, after);

  assert.equal(diff.width, 2);
  assert.equal(diff.height, 1);
  assert.equal(diff.totalPixels, 2);
  assert.equal(diff.changedPixels, 0);
  assert.equal(diff.dimensionsChanged, true);
});

function pngBuffer(width, height, pixels) {
  const png = new PNG({ width, height });
  pixels.forEach((pixel, index) => {
    const offset = index << 2;
    png.data[offset] = pixel[0];
    png.data[offset + 1] = pixel[1];
    png.data[offset + 2] = pixel[2];
    png.data[offset + 3] = pixel[3];
  });
  return PNG.sync.write(png);
}
