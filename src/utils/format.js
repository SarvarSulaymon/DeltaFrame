export function padNumber(value, width = 4) {
  return String(value).padStart(width, "0");
}

export function slugify(value, fallback = "trace") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

export function routeFromUrl(value) {
  try {
    const url = new URL(value);
    return `${url.pathname || "/"}${url.search}${url.hash}`;
  } catch {
    return "";
  }
}

export function labelWithRoute(label, url) {
  const base = String(label || "").trim() || "state";
  const route = routeFromUrl(url);
  return route ? `${base} ${route}` : base;
}

export function timestampSlug(date = new Date()) {
  const iso = date.toISOString();
  return iso
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[:]/g, "-")
    .replace("T", "-")
    .replace("Z", "");
}

export function parseViewport(value) {
  const match = String(value).match(/^(\d+)x(\d+)$/i);
  if (!match) {
    throw new Error(`Invalid viewport "${value}". Use WIDTHxHEIGHT, for example 1440x900.`);
  }
  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
}

export function parseRegion(value) {
  const match = String(value).match(/^(-?\d+),(-?\d+),(\d+),(\d+)$/);
  if (!match) {
    throw new Error(`Invalid region "${value}". Use x,y,width,height, for example 0,0,800,600.`);
  }
  const region = {
    x: Number(match[1]),
    y: Number(match[2]),
    width: Number(match[3]),
    height: Number(match[4])
  };
  if (region.width < 1 || region.height < 1) {
    throw new Error(`Invalid region "${value}". Width and height must be positive.`);
  }
  return region;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toPosixPath(value) {
  return value.replaceAll("\\", "/");
}
