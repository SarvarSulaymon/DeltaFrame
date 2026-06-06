import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { readTrace } from "../trace/store.js";

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

      if (url.pathname.startsWith("/file/")) {
        const relative = decodeURIComponent(url.pathname.slice("/file/".length));
        const target = path.resolve(absoluteTraceDir, relative);
        if (!target.startsWith(absoluteTraceDir)) {
          send(response, 403, "text/plain; charset=utf-8", "Forbidden");
          return;
        }
        const body = await fs.readFile(target);
        send(response, 200, contentType(target), body);
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
      --accent-2: #b4463a;
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
    button.state img { width: 54px; height: 38px; object-fit: cover; border: 1px solid var(--line); border-radius: 4px; }
    .state-title { font-weight: 650; font-size: 13px; overflow-wrap: anywhere; }
    .state-meta { color: var(--muted); font-size: 12px; margin-top: 3px; }
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
    @media (max-width: 920px) {
      main { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--line); }
      .viewer { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <h1>DeltaFrame Review</h1>
    <div class="sub" id="traceSub"></div>
  </header>
  <main>
    <aside id="states"></aside>
    <section id="details"></section>
  </main>
  <script>
    const trace = ${encodedTrace};
    let selected = 0;
    const statesEl = document.getElementById("states");
    const detailsEl = document.getElementById("details");
    document.getElementById("traceSub").textContent =
      trace.name + " · " + trace.states.length + " states · " + trace.source.url;

    function fileUrl(path) {
      return "/file/" + encodeURIComponent(path).replaceAll("%2F", "/");
    }

    function pct(value) {
      return value == null ? "n/a" : (value * 100).toFixed(3) + "%";
    }

    function renderList() {
      statesEl.innerHTML = "";
      trace.states.forEach((state, index) => {
        const button = document.createElement("button");
        button.className = "state" + (index === selected ? " active" : "");
        button.innerHTML =
          '<img src="' + fileUrl(state.image) + '" alt="">' +
          '<div><div class="state-title">' + state.id + " " + escapeHtml(state.label) + '</div>' +
          '<div class="state-meta">' + state.timestampMs + 'ms · ' + pct(state.metrics && state.metrics.ratio) + '</div></div>';
        button.onclick = () => {
          selected = index;
          render();
        };
        statesEl.appendChild(button);
      });
    }

    function renderDetails() {
      const state = trace.states[selected];
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
          '<dt>Label</dt><dd>' + escapeHtml(state.label) + '</dd>' +
          '<dt>URL</dt><dd>' + escapeHtml(state.url) + '</dd>' +
          '<dt>Changed</dt><dd>' + pct(state.metrics && state.metrics.ratio) + '</dd>' +
          '<dt>Image</dt><dd>' + escapeHtml(state.image) + '</dd>' +
          '<dt>Diff</dt><dd>' + escapeHtml(state.diffFromPrevious || "n/a") + '</dd>' +
        '</dl>' +
        (consoleText ? '<div class="console">' + escapeHtml(consoleText) + '</div>' : '');
    }

    function render() {
      renderList();
      renderDetails();
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    render();
  </script>
</body>
</html>`;
}
