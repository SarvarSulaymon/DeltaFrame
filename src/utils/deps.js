import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

export async function loadPackage(name) {
  try {
    return await import(name);
  } catch (error) {
    const resolved = resolvePackage(name);
    if (!resolved) {
      throw new Error(
        `Missing dependency "${name}". Run "npm install" in the DeltaFrame project.\n` +
        `Original error: ${error.message}`
      );
    }
    return import(pathToFileURL(resolved).href);
  }
}

export async function packageAvailable(name) {
  try {
    await loadPackage(name);
    return true;
  } catch {
    return false;
  }
}

function resolvePackage(name) {
  const extraPaths = [
    ...splitPaths(process.env.NODE_PATH),
    process.env.DELTAFRAME_NODE_MODULES
  ].filter(Boolean);

  for (const base of extraPaths) {
    try {
      return require.resolve(name, { paths: [base] });
    } catch {
      // Keep trying other runtime-provided module directories.
    }
  }

  try {
    return require.resolve(name, { paths: [process.cwd(), path.dirname(import.meta.url)] });
  } catch {
    return undefined;
  }
}

function splitPaths(value) {
  return value ? value.split(path.delimiter).filter(Boolean) : [];
}
