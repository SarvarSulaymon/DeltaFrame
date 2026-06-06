import fs from "node:fs/promises";
import path from "node:path";
import { formatIssueGroup } from "../diagnostics/issues.js";
import { slugify, timestampSlug, toPosixPath } from "../utils/format.js";

export async function createTraceDir({ outDir, name }) {
  const root = path.resolve(outDir);
  await mkdirp(root);
  const baseName = `${timestampSlug()}-${slugify(name || "trace")}`;

  for (let counter = 1; ; counter += 1) {
    const suffix = counter === 1 ? "" : `-${counter}`;
    const traceDir = path.join(root, `${baseName}${suffix}`);

    try {
      await fs.mkdir(traceDir);
      await mkdirp(path.join(traceDir, "frames"));
      await mkdirp(path.join(traceDir, "diffs"));
      return traceDir;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
    }
  }
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

export async function readCuration(traceDir, trace = undefined) {
  const resolvedTrace = trace || await readTrace(traceDir);
  const stateIds = new Set((resolvedTrace.states || []).map((state) => state.id));
  const curationPath = path.join(traceDir, "curation.json");
  let raw = {};

  if (await exists(curationPath)) {
    raw = JSON.parse(await fs.readFile(curationPath, "utf8"));
  }

  const ignoredInput = Array.isArray(raw.ignoredIds)
    ? raw.ignoredIds
    : Object.entries(raw.states || {})
      .filter(([, status]) => status === "ignored")
      .map(([id]) => id);
  const ignoredSet = new Set(ignoredInput.filter((id) => stateIds.has(id)));
  const keptIds = (resolvedTrace.states || [])
    .map((state) => state.id)
    .filter((id) => !ignoredSet.has(id));
  const ignoredIds = (resolvedTrace.states || [])
    .map((state) => state.id)
    .filter((id) => ignoredSet.has(id));
  const annotations = normalizeAnnotations(raw.annotations, stateIds);

  return {
    version: 1,
    updatedAt: raw.updatedAt || null,
    keptIds,
    ignoredIds,
    annotations,
    counts: {
      kept: keptIds.length,
      ignored: ignoredIds.length,
      total: stateIds.size
    }
  };
}

export async function writeCuration(traceDir, input, trace = undefined) {
  const resolvedTrace = trace || await readTrace(traceDir);
  const stateIds = new Set((resolvedTrace.states || []).map((state) => state.id));
  const ignoredIds = normalizeIgnoredIds(input, stateIds);
  const existingCuration = await readCuration(traceDir, resolvedTrace);
  const annotationInput = Object.hasOwn(input || {}, "annotations")
    ? input.annotations
    : existingCuration.annotations;
  const { annotations, unknownIds: unknownAnnotationIds } = normalizeAnnotations(annotationInput, stateIds, true);
  const unknownIds = ignoredIds.filter((id) => !stateIds.has(id));
  unknownIds.push(...unknownAnnotationIds);
  const unknownIdSet = new Set(unknownIds);

  if (unknownIdSet.size) {
    throw new Error(`Unknown state id(s): ${[...unknownIdSet].join(", ")}`);
  }

  const curation = {
    version: 1,
    updatedAt: new Date().toISOString(),
    ignoredIds,
    annotations
  };
  await fs.writeFile(
    path.join(traceDir, "curation.json"),
    `${JSON.stringify(curation, null, 2)}\n`,
    "utf8"
  );
  return await readCuration(traceDir, resolvedTrace);
}

export async function exportCuratedTrace(traceDir, options = {}) {
  const sourceTraceDir = path.resolve(traceDir);
  const trace = await readTrace(sourceTraceDir);
  const curation = await readCuration(sourceTraceDir, trace);
  const keptIds = new Set(curation.keptIds);
  const ignoredIds = curation.ignoredIds;
  const outputRoot = options.outDir ? path.resolve(options.outDir) : path.dirname(sourceTraceDir);
  const exportDir = await createUniqueTraceDir(outputRoot, `${path.basename(sourceTraceDir)}-curated`);
  const previousById = new Map();

  for (let index = 1; index < (trace.states || []).length; index += 1) {
    previousById.set(trace.states[index].id, trace.states[index - 1].id);
  }

  try {
    const states = [];
    const keptAnnotations = Object.fromEntries(
      Object.entries(curation.annotations || {}).filter(([id]) => keptIds.has(id))
    );

    for (const state of trace.states || []) {
      if (!keptIds.has(state.id)) continue;

      const nextState = { ...state };
      await copyTracePng(sourceTraceDir, exportDir, state.image, "state image");

      const previousId = previousById.get(state.id);
      if (state.diffFromPrevious && previousId && keptIds.has(previousId)) {
        await copyTracePng(sourceTraceDir, exportDir, state.diffFromPrevious, "state diff");
      } else {
        delete nextState.diffFromPrevious;
      }

      states.push(nextState);
    }

    const curatedTrace = {
      ...trace,
      states,
      curation: {
        sourceTracePath: sourceTraceDir,
        exportedAt: options.exportedAt || new Date().toISOString(),
        keptIds: curation.keptIds,
        ignoredIds,
        annotations: keptAnnotations
      }
    };

    await writeTrace(exportDir, curatedTrace);
    await writeSummary(exportDir, curatedTrace);
    return {
      traceDir: exportDir,
      trace: curatedTrace,
      curation: curatedTrace.curation
    };
  } catch (error) {
    await fs.rm(exportDir, { recursive: true, force: true });
    throw error;
  }
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
    if (state.route) {
      lines.push(`  - Route: ${state.route}`);
    }
    lines.push(`  - URL: ${state.url}`);
    lines.push(`  - Image: ${state.image}`);
    if (state.diffFromPrevious) {
      lines.push(`  - Diff: ${state.diffFromPrevious}`);
    }
    if (state.metrics) {
      lines.push(`  - Changed: ${(state.metrics.ratio * 100).toFixed(3)}%`);
    }
    const annotation = trace.curation?.annotations?.[state.id];
    if (annotation) {
      const annotationLines = String(annotation).split(/\r?\n/);
      lines.push(`  - Annotation: ${annotationLines[0]}`);
      for (const line of annotationLines.slice(1)) {
        lines.push(`    ${line}`);
      }
    }
    if (state.console?.length) {
      lines.push(`  - Console: ${state.console.length} event(s)`);
    }
    if (state.network?.length) {
      lines.push(`  - Network: ${state.network.length} issue event(s)`);
    }
    if (state.issues?.length) {
      lines.push(`  - Issues: ${state.issues.length} group(s)`);
      for (const issue of state.issues) {
        lines.push(`    - ${formatIssueGroup(issue)}`);
      }
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
      states: trace.states?.length || 0,
      issueGroups: (trace.states || []).reduce((total, state) => total + (state.issues?.length || 0), 0)
    });
  }
  traces.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return traces;
}

export function relativeTracePath(traceDir, filePath) {
  return toPosixPath(path.relative(traceDir, filePath));
}

function normalizeIgnoredIds(input, stateIds) {
  if (Array.isArray(input?.ignoredIds)) {
    return uniqueStrings(input.ignoredIds);
  }

  if (input?.states && typeof input.states === "object") {
    return uniqueStrings(
      Object.entries(input.states)
        .filter(([, status]) => status === "ignored" || status === false)
        .map(([id]) => id)
    );
  }

  if (Array.isArray(input?.keptIds)) {
    const keptIds = new Set(uniqueStrings(input.keptIds));
    return [...stateIds].filter((id) => !keptIds.has(id));
  }

  return [];
}

function normalizeAnnotations(input, stateIds, includeUnknown = false) {
  const unknownIds = [];

  if (!isPlainObject(input)) {
    return includeUnknown ? { annotations: {}, unknownIds } : {};
  }

  const annotations = {};
  for (const [id, rawNote] of Object.entries(input)) {
    const note = normalizeAnnotationNote(rawNote);
    if (!note) continue;

    if (!stateIds.has(id)) {
      if (includeUnknown) {
        unknownIds.push(id);
      }
      continue;
    }

    annotations[id] = note;
  }

  return includeUnknown ? { annotations, unknownIds } : annotations;
}

function normalizeAnnotationNote(value) {
  if (typeof value === "string") {
    const note = value.trim();
    return note ? note : null;
  }

  if (isPlainObject(value)) {
    if (typeof value.note === "string") {
      const note = value.note.trim();
      return note ? note : null;
    }
    if (typeof value.text === "string") {
      const note = value.text.trim();
      return note ? note : null;
    }
  }

  return null;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string"))];
}

async function createUniqueTraceDir(root, name) {
  await mkdirp(root);
  const safeName = slugify(name, "curated-trace");

  for (let counter = 1; ; counter += 1) {
    const suffix = counter === 1 ? "" : `-${counter}`;
    const traceDir = path.join(root, `${safeName}${suffix}`);
    try {
      await fs.mkdir(traceDir);
      await mkdirp(path.join(traceDir, "frames"));
      await mkdirp(path.join(traceDir, "diffs"));
      return traceDir;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
    }
  }
}

async function copyTracePng(sourceTraceDir, outputTraceDir, relativeFile, label) {
  if (!relativeFile || path.isAbsolute(relativeFile) || path.extname(relativeFile).toLowerCase() !== ".png") {
    throw new Error(`Invalid ${label} path: ${relativeFile}`);
  }

  const sourceFile = path.resolve(sourceTraceDir, relativeFile);
  assertPathInside(sourceTraceDir, sourceFile, label);
  const realSourceTraceDir = await fs.realpath(sourceTraceDir);
  const realSourceFile = await fs.realpath(sourceFile);
  assertPathInside(realSourceTraceDir, realSourceFile, label);

  const outputFile = path.resolve(outputTraceDir, relativeFile);
  assertPathInside(outputTraceDir, outputFile, label);
  await mkdirp(path.dirname(outputFile));
  await fs.copyFile(realSourceFile, outputFile);
}

function assertPathInside(parent, target, label) {
  const relative = path.relative(parent, target);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`${label} must stay inside the trace directory`);
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
