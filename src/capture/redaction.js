import { normalizeMaskRegions } from "../diff/masks.js";
import { loadPackage } from "../utils/deps.js";

export async function applyRedactionsToPngBuffer(buffer, redactions) {
  const regions = normalizeMaskRegions(redactions);
  if (!regions.length) return buffer;

  const pngModule = await loadPackage("pngjs");
  const PNG = pngModule.PNG || pngModule.default?.PNG;
  if (!PNG) {
    throw new Error("Could not load pngjs PNG API.");
  }

  const png = PNG.sync.read(buffer);
  for (const region of regions) {
    fillRegion(png, region);
  }
  return PNG.sync.write(png);
}

function fillRegion(png, region) {
  const left = Math.max(0, Math.floor(region.x));
  const top = Math.max(0, Math.floor(region.y));
  const right = Math.min(png.width, Math.ceil(region.x + region.width));
  const bottom = Math.min(png.height, Math.ceil(region.y + region.height));

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const index = (png.width * y + x) << 2;
      png.data[index] = 0;
      png.data[index + 1] = 0;
      png.data[index + 2] = 0;
      png.data[index + 3] = 255;
    }
  }
}
