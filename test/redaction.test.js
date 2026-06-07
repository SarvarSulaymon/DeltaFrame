import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import { applyRedactionsToPngBuffer } from "../src/capture/redaction.js";

test("applyRedactionsToPngBuffer blacks out selected pixels", async () => {
  const png = new PNG({ width: 2, height: 2 });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 255;
    png.data[index + 1] = 255;
    png.data[index + 2] = 255;
    png.data[index + 3] = 255;
  }

  const redacted = PNG.sync.read(await applyRedactionsToPngBuffer(
    PNG.sync.write(png),
    [{ x: 1, y: 0, width: 1, height: 2 }]
  ));

  assert.deepEqual(pixel(redacted, 0, 0), [255, 255, 255, 255]);
  assert.deepEqual(pixel(redacted, 1, 0), [0, 0, 0, 255]);
  assert.deepEqual(pixel(redacted, 1, 1), [0, 0, 0, 255]);
});

function pixel(png, x, y) {
  const index = (png.width * y + x) << 2;
  return Array.from(png.data.slice(index, index + 4));
}
