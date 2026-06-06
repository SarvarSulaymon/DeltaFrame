import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import { diffPngBuffers } from "../src/diff/imageDiff.js";
import { normalizeMaskRegions } from "../src/diff/masks.js";

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

test("diffPngBuffers ignores masked pixels without mutating screenshots", async () => {
  const before = pngBuffer(2, 2, [
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255]
  ]);
  const after = pngBuffer(2, 2, [
    [0, 0, 0, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [0, 0, 0, 255]
  ]);

  const diff = await diffPngBuffers(before, after, {
    pixelThreshold: 0,
    masks: [{ x: 0, y: 0, width: 1, height: 1, label: "clock" }]
  });
  const afterPng = PNG.sync.read(after);

  assert.equal(diff.changedPixels, 1);
  assert.equal(diff.totalPixels, 3);
  assert.equal(diff.ratio, 1 / 3);
  assert.deepEqual([...afterPng.data.slice(0, 4)], [0, 0, 0, 255]);
});

test("diffPngBuffers clips and de-duplicates overlapping mask regions", async () => {
  const before = pngBuffer(3, 1, [
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255]
  ]);
  const after = pngBuffer(3, 1, [
    [0, 0, 0, 255],
    [0, 0, 0, 255],
    [0, 0, 0, 255]
  ]);

  const diff = await diffPngBuffers(before, after, {
    pixelThreshold: 0,
    masks: [
      { x: -1, y: 0, width: 2, height: 1 },
      { x: 0, y: 0, width: 2, height: 1 }
    ]
  });

  assert.equal(diff.changedPixels, 1);
  assert.equal(diff.totalPixels, 1);
  assert.equal(diff.ratio, 1);
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

test("normalizeMaskRegions parses and normalizes JSON-friendly regions", () => {
  assert.deepEqual(
    normalizeMaskRegions('[{"x":1.2,"y":2.8,"width":3.1,"height":4.1,"label":"ticker"}]'),
    [{ x: 1, y: 2, width: 4, height: 5, label: "ticker" }]
  );
  assert.deepEqual(
    normalizeMaskRegions({ x: "0", y: "0", width: "2", height: "1" }),
    [{ x: 0, y: 0, width: 2, height: 1 }]
  );
});

test("normalizeMaskRegions rejects invalid regions", () => {
  assert.throws(
    () => normalizeMaskRegions('[{"x":0,"y":0,"width":0,"height":1}]'),
    /width and height must be greater than 0/
  );
  assert.throws(
    () => normalizeMaskRegions("["),
    /must be valid JSON/
  );
  assert.throws(
    () => normalizeMaskRegions([{ x: null, y: 0, width: 1, height: 1 }]),
    /x must be a finite number/
  );
  assert.throws(
    () => normalizeMaskRegions([{ x: 0, y: 0, width: 1, height: 1, label: 42 }]),
    /label must be a string/
  );
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
