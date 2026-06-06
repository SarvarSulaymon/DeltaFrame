import { loadPackage } from "../utils/deps.js";
import { copyMaskedPixels, maskedPixelCount, normalizeMaskRegions } from "./masks.js";

export async function diffPngBuffers(beforeBuffer, afterBuffer, options = {}) {
  const pixelmatchModule = await loadPackage("pixelmatch");
  const pngModule = await loadPackage("pngjs");
  const pixelmatch = pixelmatchModule.default || pixelmatchModule;
  const PNG = pngModule.PNG || pngModule.default?.PNG;

  if (!PNG) {
    throw new Error("Could not load pngjs PNG API.");
  }

  const before = PNG.sync.read(beforeBuffer);
  const after = PNG.sync.read(afterBuffer);
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const normalizedBefore = normalizePng(PNG, before, width, height);
  const normalizedAfter = normalizePng(PNG, after, width, height);
  const masks = normalizeMaskRegions(options.masks);
  copyMaskedPixels(normalizedBefore, normalizedAfter, masks, width, height);
  const diff = new PNG({ width, height });

  const changedPixels = pixelmatch(
    normalizedBefore.data,
    normalizedAfter.data,
    diff.data,
    width,
    height,
    {
      threshold: options.pixelThreshold ?? 0.12,
      includeAA: false,
      alpha: 0.45,
      diffColor: [255, 0, 96],
      diffColorAlt: [0, 160, 255]
    }
  );

  const totalPixels = Math.max(0, width * height - maskedPixelCount(masks, width, height));

  return {
    changedPixels,
    totalPixels,
    ratio: totalPixels === 0 ? 0 : changedPixels / totalPixels,
    width,
    height,
    dimensionsChanged: before.width !== after.width || before.height !== after.height,
    diffBuffer: PNG.sync.write(diff)
  };
}

function normalizePng(PNG, source, width, height) {
  if (source.width === width && source.height === height) {
    return source;
  }

  const target = new PNG({ width, height });
  fillWhite(target.data);

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceIndex = (source.width * y + x) << 2;
      const targetIndex = (width * y + x) << 2;
      target.data[targetIndex] = source.data[sourceIndex];
      target.data[targetIndex + 1] = source.data[sourceIndex + 1];
      target.data[targetIndex + 2] = source.data[sourceIndex + 2];
      target.data[targetIndex + 3] = source.data[sourceIndex + 3];
    }
  }

  return target;
}

function fillWhite(data) {
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = 255;
  }
}
