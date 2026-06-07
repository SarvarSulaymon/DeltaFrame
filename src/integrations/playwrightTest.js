import fs from "node:fs/promises";
import path from "node:path";

export async function attachDeltaFrameTrace(testInfo, traceDir, options = {}) {
  if (!testInfo || typeof testInfo.attach !== "function") {
    return false;
  }

  const name = options.name || "deltaframe";
  await testInfo.attach(`${name}-trace-dir`, {
    body: Buffer.from(`${traceDir}\n`, "utf8"),
    contentType: "text/plain"
  });
  await attachIfExists(testInfo, `${name}-summary`, path.join(traceDir, "summary.md"), "text/markdown");
  await attachIfExists(testInfo, `${name}-trace-json`, path.join(traceDir, "trace.json"), "application/json");
  return true;
}

export async function attachDeltaFrameTraceOnFailure(testInfo, traceDir, options = {}) {
  if (testInfo?.status && testInfo?.expectedStatus && testInfo.status === testInfo.expectedStatus) {
    return false;
  }
  return attachDeltaFrameTrace(testInfo, traceDir, options);
}

async function attachIfExists(testInfo, name, filePath, contentType) {
  try {
    await fs.access(filePath);
  } catch {
    return;
  }

  await testInfo.attach(name, {
    path: filePath,
    contentType
  });
}
