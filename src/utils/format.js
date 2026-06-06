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

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toPosixPath(value) {
  return value.replaceAll("\\", "/");
}
