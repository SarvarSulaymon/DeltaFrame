export function normalizeMaskRegions(value, label = "masks") {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  const parsed = typeof value === "string" ? parseMaskJson(value, label) : value;
  const regions = Array.isArray(parsed) ? parsed : [parsed];

  return regions.map((region, index) => normalizeMaskRegion(region, `${label}[${index}]`));
}

export function maskedPixelCount(masks, width, height) {
  if (!masks?.length || width <= 0 || height <= 0) {
    return 0;
  }

  const masked = new Uint8Array(width * height);
  let count = 0;

  for (const mask of masks) {
    const bounds = clippedMaskBounds(mask, width, height);
    if (!bounds) continue;

    for (let y = bounds.top; y < bounds.bottom; y += 1) {
      for (let x = bounds.left; x < bounds.right; x += 1) {
        const index = y * width + x;
        if (masked[index]) continue;
        masked[index] = 1;
        count += 1;
      }
    }
  }

  return count;
}

export function copyMaskedPixels(source, target, masks, width, height) {
  if (!masks?.length) {
    return;
  }

  for (const mask of masks) {
    const bounds = clippedMaskBounds(mask, width, height);
    if (!bounds) continue;

    for (let y = bounds.top; y < bounds.bottom; y += 1) {
      for (let x = bounds.left; x < bounds.right; x += 1) {
        const index = (y * width + x) << 2;
        target.data[index] = source.data[index];
        target.data[index + 1] = source.data[index + 1];
        target.data[index + 2] = source.data[index + 2];
        target.data[index + 3] = source.data[index + 3];
      }
    }
  }
}

function parseMaskJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function normalizeMaskRegion(region, label) {
  if (!region || typeof region !== "object" || Array.isArray(region)) {
    throw new Error(`${label} must be an object with x, y, width, and height.`);
  }

  const x = numberField(region, "x", label);
  const y = numberField(region, "y", label);
  const width = numberField(region, "width", label);
  const height = numberField(region, "height", label);

  if (width <= 0 || height <= 0) {
    throw new Error(`${label} width and height must be greater than 0.`);
  }

  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.ceil(x + width);
  const bottom = Math.ceil(y + height);
  const normalized = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };

  if (region.label !== undefined && region.label !== "") {
    if (typeof region.label !== "string") {
      throw new Error(`${label}.label must be a string when provided.`);
    }
    normalized.label = region.label;
  }

  return normalized;
}

function numberField(region, field, label) {
  const raw = region[field];
  if (raw === undefined || raw === null || raw === "" || typeof raw === "boolean") {
    throw new Error(`${label}.${field} must be a finite number.`);
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${label}.${field} must be a finite number.`);
  }
  return value;
}

function clippedMaskBounds(mask, width, height) {
  const left = Math.max(0, Math.min(width, mask.x));
  const top = Math.max(0, Math.min(height, mask.y));
  const right = Math.max(0, Math.min(width, mask.x + mask.width));
  const bottom = Math.max(0, Math.min(height, mask.y + mask.height));

  if (right <= left || bottom <= top) {
    return undefined;
  }

  return { left, top, right, bottom };
}
