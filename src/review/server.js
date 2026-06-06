import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { exportCuratedTrace, readCuration, readTrace, writeCuration } from "../trace/store.js";

export async function startReviewServer({ traceDir, port }) {
  const absoluteTraceDir = path.resolve(traceDir);
  const trace = await readTrace(absoluteTraceDir);

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://localhost:${port}`);

      if (url.pathname === "/") {
        send(response, 200, "text/html; charset=utf-8", buildHtml(trace));
        return;
      }

      if (url.pathname === "/trace.json") {
        const body = await fs.readFile(path.join(absoluteTraceDir, "trace.json"));
        send(response, 200, "application/json; charset=utf-8", body);
        return;
      }

      if (url.pathname === "/curation" && request.method === "GET") {
        sendJson(response, 200, await readCuration(absoluteTraceDir, trace));
        return;
      }

      if (url.pathname === "/curation" && request.method === "PUT") {
        const body = await readJsonBody(request);
        sendJson(response, 200, await writeCuration(absoluteTraceDir, body, trace));
        return;
      }

      if (url.pathname === "/export" && request.method === "POST") {
        const result = await exportCuratedTrace(absoluteTraceDir);
        sendJson(response, 201, {
          traceDir: result.traceDir,
          stateCount: result.trace.states.length,
          curation: result.curation
        });
        return;
      }

      if (url.pathname.startsWith("/file/")) {
        const relative = decodeURIComponent(url.pathname.slice("/file/".length));
        const target = path.resolve(absoluteTraceDir, relative);
        if (!isPathInside(absoluteTraceDir, target)) {
          send(response, 403, "text/plain; charset=utf-8", "Forbidden");
          return;
        }

        const realTraceDir = await fs.realpath(absoluteTraceDir);
        const realTarget = await fs.realpath(target);
        if (!isPathInside(realTraceDir, realTarget)) {
          send(response, 403, "text/plain; charset=utf-8", "Forbidden");
          return;
        }

        const body = await fs.readFile(realTarget);
        send(response, 200, contentType(realTarget), body);
        return;
      }

      send(response, 404, "text/plain; charset=utf-8", "Not found");
    } catch (error) {
      send(response, 500, "text/plain; charset=utf-8", error.stack || error.message);
    }
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  console.log(`DeltaFrame review: ${url}`);
  console.log(`Trace: ${absoluteTraceDir}`);
  console.log("Press Ctrl+C to stop.");

  await new Promise((resolve) => {
    const stop = () => {
      server.close(resolve);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

function send(response, status, type, body) {
  response.writeHead(status, { "content-type": type });
  response.end(body);
}

function sendJson(response, status, body) {
  send(response, status, "application/json; charset=utf-8", `${JSON.stringify(body, null, 2)}\n`);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      throw new Error("Request body is too large");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isPathInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function contentType(filePath) {
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

function buildHtml(initialTrace) {
  const encodedTrace = JSON.stringify(initialTrace).replaceAll("</", "<\\/");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DeltaFrame Review</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f7f4;
      --panel: #ffffff;
      --ink: #1f2528;
      --muted: #687277;
      --line: #d9dedc;
      --accent: #0b6f6a;
      --ignored: #8a4f45;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 1;
      border-bottom: 1px solid var(--line);
      background: rgba(247, 247, 244, 0.96);
      padding: 18px 24px;
    }
    h1 { margin: 0; font-size: 22px; line-height: 1.2; }
    .sub { color: var(--muted); margin-top: 6px; font-size: 14px; }
    .context-line {
      margin-top: 8px;
      color: var(--ink);
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .topline {
      display: flex;
      gap: 14px;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
    }
    .actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    button.action {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--panel);
      color: var(--ink);
      min-height: 34px;
      padding: 7px 11px;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }
    button.action.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
    }
    button.action:disabled {
      color: var(--muted);
      cursor: wait;
      opacity: 0.75;
    }
    .status-line {
      margin-top: 8px;
      color: var(--muted);
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    main {
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      min-height: calc(100vh - 82px);
    }
    aside {
      border-right: 1px solid var(--line);
      padding: 16px;
      overflow: auto;
    }
    section {
      padding: 20px;
      overflow: auto;
    }
    button.state {
      width: 100%;
      display: grid;
      grid-template-columns: 54px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 8px;
      margin-bottom: 10px;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    button.state.active { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(11, 111, 106, 0.16); }
    button.state.ignored { opacity: 0.62; }
    button.state.ignored .state-title { text-decoration: line-through; }
    button.state img { width: 54px; height: 38px; object-fit: cover; border: 1px solid var(--line); border-radius: 4px; }
    .state-title { font-weight: 650; font-size: 13px; overflow-wrap: anywhere; }
    .state-meta { color: var(--muted); font-size: 12px; margin-top: 3px; }
    .pill {
      display: inline-block;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 1px 7px 2px;
      margin-left: 6px;
      font-size: 11px;
      color: var(--accent);
      background: #eef7f5;
    }
    .pill.ignored {
      color: var(--ignored);
      background: #fbefec;
    }
    .pill.issue {
      color: #7a4f00;
      background: #fff7df;
    }
    .viewer {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    .image-panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      min-width: 0;
    }
    .image-panel h2 {
      margin: 0 0 10px;
      font-size: 15px;
      line-height: 1.2;
    }
    .image-panel img {
      width: 100%;
      height: auto;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
    }
    dl {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: 7px 14px;
      margin: 16px 0 0;
      font-size: 13px;
    }
    dt { color: var(--muted); }
    dd { margin: 0; overflow-wrap: anywhere; }
    .console {
      margin-top: 16px;
      padding: 12px;
      background: #2a1f1d;
      color: #ffe7df;
      border-radius: 8px;
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      white-space: pre-wrap;
    }
    .issues {
      margin-top: 16px;
      padding: 12px;
      background: #fffaf0;
      border: 1px solid #ead8a8;
      border-radius: 8px;
      color: #3f3218;
      font-size: 12px;
      white-space: pre-wrap;
    }
    @media (max-width: 920px) {
      main { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--line); }
      .viewer { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div class="topline">
      <h1>DeltaFrame Review</h1>
      <div class="actions">
        <button class="action" id="toggleState" type="button">Ignore State</button>
        <button class="action primary" id="exportTrace" type="button">Export Kept</button>
      </div>
    </div>
    <div class="sub" id="traceSub"></div>
    <div class="context-line" id="contextLine"></div>
    <div class="status-line" id="statusLine"></div>
  </header>
  <main>
    <aside id="states"></aside>
    <section id="details"></section>
  </main>
  <script>
    const trace = ${encodedTrace};
    let selected = 0;
    let curation = {
      keptIds: trace.states.map((state) => state.id),
      ignoredIds: [],
      counts: { kept: trace.states.length, ignored: 0, total: trace.states.length }
    };
    let busy = false;
    const statesEl = document.getElementById("states");
    const detailsEl = document.getElementById("details");
    const traceSubEl = document.getElementById("traceSub");
    const contextLineEl = document.getElementById("contextLine");
    const statusLineEl = document.getElementById("statusLine");
    const toggleStateEl = document.getElementById("toggleState");
    const exportTraceEl = document.getElementById("exportTrace");

    toggleStateEl.onclick = () => toggleSelectedState();
    exportTraceEl.onclick = () => exportKeptTrace();

    function fileUrl(path) {
      return "/file/" + encodeURIComponent(path).replaceAll("%2F", "/");
    }

    function pct(value) {
      return value == null ? "n/a" : (value * 100).toFixed(3) + "%";
    }

    function issueLabel(state) {
      const count = (state.issues || []).reduce((total, issue) => total + (issue.count || 0), 0);
      return count ? '<span class="pill issue">' + count + ' issue' + (count === 1 ? '' : 's') + '</span>' : '';
    }

    function ignoredSet() {
      return new Set(curation.ignoredIds || []);
    }

    function selectedState() {
      return trace.states[selected];
    }

    function isIgnored(state) {
      return ignoredSet().has(state.id);
    }

    function renderHeader() {
      const counts = curation.counts || {
        kept: trace.states.length - (curation.ignoredIds || []).length,
        ignored: (curation.ignoredIds || []).length,
        total: trace.states.length
      };
      traceSubEl.textContent =
        trace.name + " - " + counts.kept + " kept / " + counts.ignored + " ignored - " + trace.source.url;
      const state = selectedState();
      contextLineEl.textContent =
        "Viewing state " + (selected + 1) + " of " + trace.states.length + ": " +
        state.id + " " + state.label + " - " + (isIgnored(state) ? "ignored" : "kept");
      toggleStateEl.textContent = isIgnored(state) ? "Keep State" : "Ignore State";
      exportTraceEl.disabled = busy || counts.kept === 0;
      toggleStateEl.disabled = busy;
    }

    function renderList() {
      statesEl.innerHTML = "";
      trace.states.forEach((state, index) => {
        const ignored = isIgnored(state);
        const button = document.createElement("button");
        button.className = "state" + (index === selected ? " active" : "") + (ignored ? " ignored" : "");
        button.innerHTML =
          '<img src="' + fileUrl(state.image) + '" alt="">' +
          '<div><div class="state-title">' + state.id + " " + escapeHtml(state.label) + '</div>' +
          '<div class="state-meta">' + state.timestampMs + 'ms - ' + pct(state.metrics && state.metrics.ratio) +
          '<span class="pill ' + (ignored ? "ignored" : "kept") + '">' + (ignored ? "ignored" : "kept") + '</span>' +
          issueLabel(state) + '</div></div>';
        button.onclick = () => {
          selected = index;
          render();
        };
        statesEl.appendChild(button);
      });
    }

    function renderDetails() {
      const state = selectedState();
      const ignored = isIgnored(state);
      const issueText = state.issues?.length
        ? state.issues.map(formatIssue).join("\\n")
        : "";
      const consoleText = state.console?.length
        ? state.console.map((event) => '[' + event.type + ' @ ' + event.timestampMs + 'ms] ' + event.text).join("\\n")
        : "";

      detailsEl.innerHTML =
        '<div class="viewer">' +
          '<div class="image-panel">' +
            '<h2>State</h2>' +
            '<img src="' + fileUrl(state.image) + '" alt="Captured state">' +
          '</div>' +
          '<div class="image-panel">' +
            '<h2>Diff From Previous</h2>' +
            (state.diffFromPrevious
              ? '<img src="' + fileUrl(state.diffFromPrevious) + '" alt="Visual diff">'
              : '<p class="sub">Initial state has no previous diff.</p>') +
          '</div>' +
        '</div>' +
        '<dl>' +
          '<dt>ID</dt><dd>' + state.id + '</dd>' +
          '<dt>Status</dt><dd>' + (ignored ? "ignored" : "kept") + '</dd>' +
          '<dt>Label</dt><dd>' + escapeHtml(state.label) + '</dd>' +
          (state.route ? '<dt>Route</dt><dd>' + escapeHtml(state.route) + '</dd>' : '') +
          '<dt>URL</dt><dd>' + escapeHtml(state.url) + '</dd>' +
          '<dt>Changed</dt><dd>' + pct(state.metrics && state.metrics.ratio) + '</dd>' +
          '<dt>Image</dt><dd>' + escapeHtml(state.image) + '</dd>' +
          '<dt>Diff</dt><dd>' + escapeHtml(state.diffFromPrevious || "n/a") + '</dd>' +
        '</dl>' +
        (issueText ? '<div class="issues">' + escapeHtml(issueText) + '</div>' : '') +
        (consoleText ? '<div class="console">' + escapeHtml(consoleText) + '</div>' : '');
    }

    function formatIssue(issue) {
      const status = issue.status == null ? "" : " " + issue.status;
      const url = issue.url ? " " + issue.url : "";
      const timing = issue.firstTimestampMs === issue.lastTimestampMs
        ? issue.firstTimestampMs + "ms"
        : issue.firstTimestampMs + "-" + issue.lastTimestampMs + "ms";
      return issue.count + "x " + issue.source + "/" + issue.type + status + url + " - " + issue.message + " (" + timing + ")";
    }

    function render() {
      renderHeader();
      renderList();
      renderDetails();
    }

    async function loadCuration() {
      try {
        const response = await fetch("/curation");
        if (!response.ok) throw new Error(await response.text());
        curation = await response.json();
      } catch (error) {
        statusLineEl.textContent = "Could not load curation: " + error.message;
      }
      render();
    }

    async function saveCuration(nextIgnoredIds) {
      busy = true;
      render();
      try {
        const response = await fetch("/curation", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ignoredIds: nextIgnoredIds })
        });
        if (!response.ok) throw new Error(await response.text());
        curation = await response.json();
        statusLineEl.textContent = "Curation saved.";
      } catch (error) {
        statusLineEl.textContent = "Could not save curation: " + error.message;
      } finally {
        busy = false;
        render();
      }
    }

    function toggleSelectedState() {
      const state = selectedState();
      const ignored = ignoredSet();
      if (ignored.has(state.id)) {
        ignored.delete(state.id);
      } else {
        ignored.add(state.id);
      }
      saveCuration(trace.states.map((item) => item.id).filter((id) => ignored.has(id)));
    }

    async function exportKeptTrace() {
      busy = true;
      statusLineEl.textContent = "Exporting kept states...";
      render();
      try {
        const response = await fetch("/export", { method: "POST" });
        if (!response.ok) throw new Error(await response.text());
        const result = await response.json();
        statusLineEl.textContent = "Exported " + result.stateCount + " kept state(s) to " + result.traceDir;
      } catch (error) {
        statusLineEl.textContent = "Could not export trace: " + error.message;
      } finally {
        busy = false;
        render();
      }
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    loadCuration();
  </script>
</body>
</html>`;
}
