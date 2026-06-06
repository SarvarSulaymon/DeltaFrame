import assert from "node:assert/strict";
import test from "node:test";
import { formatIssueGroup, groupIssueEvents, issueEventsFromState } from "../src/diagnostics/issues.js";

test("groupIssueEvents groups repeated diagnostics by source type message url and status", () => {
  const issues = groupIssueEvents([
    {
      source: "console",
      type: "error",
      message: "Hydration failed",
      url: "http://localhost:3000/app.js",
      timestampMs: 42
    },
    {
      source: "network",
      type: "http",
      message: "HTTP 500 Internal Server Error",
      url: "http://localhost:3000/api/items",
      status: 500,
      timestampMs: 50
    },
    {
      source: "console",
      type: "error",
      message: "Hydration failed",
      url: "http://localhost:3000/app.js",
      timestampMs: 75
    }
  ]);

  assert.deepEqual(issues, [
    {
      source: "console",
      type: "error",
      message: "Hydration failed",
      url: "http://localhost:3000/app.js",
      status: null,
      count: 2,
      firstTimestampMs: 42,
      lastTimestampMs: 75
    },
    {
      source: "network",
      type: "http",
      message: "HTTP 500 Internal Server Error",
      url: "http://localhost:3000/api/items",
      status: 500,
      count: 1,
      firstTimestampMs: 50,
      lastTimestampMs: 50
    }
  ]);
});

test("issueEventsFromState converts console and network diagnostics into grouped issue input", () => {
  const events = issueEventsFromState({
    console: [
      {
        type: "warning",
        text: "Missing alt text",
        timestampMs: 12
      }
    ],
    network: [
      {
        type: "requestfailed",
        message: "net::ERR_CONNECTION_REFUSED",
        url: "http://localhost:9/api",
        timestampMs: 20
      }
    ]
  });

  assert.deepEqual(groupIssueEvents(events), [
    {
      source: "console",
      type: "warning",
      message: "Missing alt text",
      url: null,
      status: null,
      count: 1,
      firstTimestampMs: 12,
      lastTimestampMs: 12
    },
    {
      source: "network",
      type: "requestfailed",
      message: "net::ERR_CONNECTION_REFUSED",
      url: "http://localhost:9/api",
      status: null,
      count: 1,
      firstTimestampMs: 20,
      lastTimestampMs: 20
    }
  ]);
});

test("formatIssueGroup returns compact agent-readable text", () => {
  assert.equal(
    formatIssueGroup({
      source: "network",
      type: "http",
      message: "HTTP 404 Not Found",
      url: "http://localhost:3000/missing",
      status: 404,
      count: 3,
      firstTimestampMs: 100,
      lastTimestampMs: 250
    }),
    "3x network/http 404 http://localhost:3000/missing - HTTP 404 Not Found (100-250ms)"
  );
});
