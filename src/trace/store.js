import fs from "node:fs/promises";
import path from "node:path";
import { slugify, timestampSlug, toPosixPath } from "../utils/format.js";

export async function createTraceDir({ outDir, name }) {
  const root = path.resolve(outDir);
  const baseName = `${timestampSlug()}-${slugify(name || "trace")}`;
  let traceDir = path.join(root, baseName);
  let counter = 2;

  while (await exists(traceDir)) {
    traceDir = path.join(root, `${baseName}-${counter}`);
    counter += 1;
  }

  await mkdirp(path.join(traceDir, "frames"));
  await mkdirp(path.join(traceDir, "diffs"));
  return traceDir;
}

export async function writeTrace(traceDir, trace) {
  await fs.writeFile(
    path.join(traceDir, "trace.json"),
    `${JSON.stringify(trace, null, 2)}\n`,
    "utf8"
  );
}

export async function readTrace(traceDir) {
  const file = path.extname(traceDir) === ".json" ? traceDir : path.join(traceDir, "trace.json");
  const text = await fs.readFile(file, "utf8");
  return JSON.parse(text);
}

export async function writeSummary(traceDir, trace) {
  const lines = [];
  lines.push(`# ${trace.name}`);
  lines.push("");
  lines.push(`Source: ${trace.source.url}`);
  lines.push(`Created: ${trace.createdAt}`);
  lines.push(`States: ${trace.states.length}`);
  lines.push("");
  lines.push("## States");
  lines.push("");

  for (const state of trace.states) {
    lines.push(`- ${state.id} ${state.label}`);
    lines.push(`  - URL: ${state.url}`);
    lines.push(`  - Image: ${state.image}`);
    if (state.diffFromPrevious) {
      lines.push(`  - Diff: ${state.diffFromPrevious}`);
    }
    if (state.metrics) {
      lines.push(`  - Changed: ${(state.metrics.ratio * 100).toFixed(3)}%`);
    }
    if (state.console?.length) {
      lines.push(`  - Console: ${state.console.length} event(s)`);
    }
  }

  lines.push("");
  lines.push("## Prompt Starter");
  lines.push("");
  lines.push("```text");
  lines.push(`Review this DeltaFrame trace: ${traceDir}`);
  lines.push("Focus on meaningful visual state changes, layout shifts, broken transitions, and states that need code changes.");
  lines.push("```");
  lines.push("");

  await fs.writeFile(path.join(traceDir, "summary.md"), `${lines.join("\n")}\n`, "utf8");
}

export async function findLatestTraceDir(root = ".deltaframe/traces") {
  const absoluteRoot = path.resolve(root);
  if (!await exists(absoluteRoot)) return undefined;

  const entries = await fs.readdir(absoluteRoot, { withFileTypes: true });
  const dirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const traceDir = path.join(absoluteRoot, entry.name);
    if (!await exists(path.join(traceDir, "trace.json"))) continue;
    const stat = await fs.stat(traceDir);
    dirs.push({ traceDir, mtimeMs: stat.mtimeMs });
  }

  dirs.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return dirs[0]?.traceDir;
}

export async function listTraceDirs(root = ".deltaframe/traces") {
  const absoluteRoot = path.resolve(root);
  if (!await exists(absoluteRoot)) return [];

  const entries = await fs.readdir(absoluteRoot, { withFileTypes: true });
  const traces = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const traceDir = path.join(absoluteRoot, entry.name);
    if (!await exists(path.join(traceDir, "trace.json"))) continue;
    const trace = await readTrace(traceDir);
    traces.push({
      name: trace.name,
      path: traceDir,
      createdAt: trace.createdAt,
      states: trace.states?.length || 0
    });
  }
  traces.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return traces;
}

export function relativeTracePath(traceDir, filePath) {
  return toPosixPath(path.relative(traceDir, filePath));
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function mkdirp(target) {
  await fs.mkdir(target, { recursive: true });
}
