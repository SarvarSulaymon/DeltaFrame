export function groupIssueEvents(events) {
  const groups = new Map();

  for (const event of events || []) {
    const issue = normalizeIssueEvent(event);
    const key = [
      issue.source,
      issue.type,
      issue.message,
      issue.url,
      issue.status
    ].join("\u001f");
    const existing = groups.get(key);

    if (existing) {
      existing.count += 1;
      existing.firstTimestampMs = Math.min(existing.firstTimestampMs, issue.timestampMs);
      existing.lastTimestampMs = Math.max(existing.lastTimestampMs, issue.timestampMs);
    } else {
      groups.set(key, {
        source: issue.source,
        type: issue.type,
        message: issue.message,
        url: issue.url,
        status: issue.status,
        count: 1,
        firstTimestampMs: issue.timestampMs,
        lastTimestampMs: issue.timestampMs
      });
    }
  }

  return [...groups.values()].sort((a, b) => (
    a.firstTimestampMs - b.firstTimestampMs ||
    a.source.localeCompare(b.source) ||
    a.type.localeCompare(b.type)
  ));
}

export function issueEventsFromState(state) {
  return [
    ...((state.console || []).map((event) => ({
      source: "console",
      type: event.type,
      message: event.text,
      url: event.url || null,
      status: null,
      timestampMs: event.timestampMs
    }))),
    ...((state.network || []).map((event) => ({
      source: "network",
      type: event.type,
      message: event.message,
      url: event.url || null,
      status: event.status ?? null,
      timestampMs: event.timestampMs
    })))
  ];
}

export function formatIssueGroup(issue) {
  const status = issue.status == null ? "" : ` ${issue.status}`;
  const url = issue.url ? ` ${issue.url}` : "";
  const timing = issue.firstTimestampMs === issue.lastTimestampMs
    ? `${issue.firstTimestampMs}ms`
    : `${issue.firstTimestampMs}-${issue.lastTimestampMs}ms`;
  return `${issue.count}x ${issue.source}/${issue.type}${status}${url} - ${issue.message} (${timing})`;
}

function normalizeIssueEvent(event) {
  return {
    source: cleanString(event?.source, "unknown"),
    type: cleanString(event?.type, "unknown"),
    message: cleanString(event?.message || event?.text, ""),
    url: cleanNullableString(event?.url),
    status: normalizeStatus(event?.status),
    timestampMs: normalizeTimestamp(event?.timestampMs)
  };
}

function cleanString(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function cleanNullableString(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function normalizeStatus(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTimestamp(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}
