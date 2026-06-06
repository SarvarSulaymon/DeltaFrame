# Trace Format

Each DeltaFrame capture writes a trace folder:

```text
trace-folder/
  trace.json
  summary.md
  frames/
  diffs/
```

## `trace.json`

Example:

```json
{
  "version": "0.1.0",
  "name": "landing-flow",
  "createdAt": "2026-06-06T12:00:00.000Z",
  "source": {
    "type": "web",
    "url": "http://localhost:3000/products/42?tab=details#pricing",
    "finalUrl": "http://localhost:3000/products/42?tab=details#pricing",
    "viewport": {
      "width": 1440,
      "height": 900
    },
    "fullPage": false
  },
  "settings": {
    "intervalMs": 200,
    "idleMs": 350,
    "durationMs": 15000,
    "minChangedRatio": 0.003,
    "pixelThreshold": 0.12,
    "maxFrames": 80
  },
  "states": [
    {
      "id": "0001",
      "label": "initial /products/42?tab=details#pricing",
      "route": "/products/42?tab=details#pricing",
      "timestampMs": 612,
      "url": "http://localhost:3000/products/42?tab=details#pricing",
      "title": "Prototype",
      "image": "frames/0001-initial-products-42-tab-details-pricing.png",
      "console": [],
      "network": [],
      "issues": []
    },
    {
      "id": "0002",
      "label": "changed-001284ms /products/42?tab=details#pricing",
      "route": "/products/42?tab=details#pricing",
      "timestampMs": 1284,
      "url": "http://localhost:3000/products/42?tab=details#pricing",
      "title": "Prototype",
      "image": "frames/0002-changed-001284ms-products-42-tab-details-pricing.png",
      "diffFromPrevious": "diffs/0001-0002.png",
      "metrics": {
        "changedPixels": 12440,
        "totalPixels": 1296000,
        "ratio": 0.009598765432098766,
        "width": 1440,
        "height": 900,
        "dimensionsChanged": false
      },
      "console": [
        {
          "type": "warning",
          "text": "Deprecated API used",
          "url": "http://localhost:3000/app.js",
          "timestampMs": 1290
        }
      ],
      "network": [
        {
          "type": "http",
          "message": "HTTP 500 Internal Server Error",
          "url": "http://localhost:3000/api/products/42",
          "method": "GET",
          "status": 500,
          "timestampMs": 1301
        }
      ],
      "issues": [
        {
          "source": "console",
          "type": "warning",
          "message": "Deprecated API used",
          "url": "http://localhost:3000/app.js",
          "status": null,
          "count": 1,
          "firstTimestampMs": 1290,
          "lastTimestampMs": 1290
        },
        {
          "source": "network",
          "type": "http",
          "message": "HTTP 500 Internal Server Error",
          "url": "http://localhost:3000/api/products/42",
          "status": 500,
          "count": 1,
          "firstTimestampMs": 1301,
          "lastTimestampMs": 1301
        }
      ]
    }
  ]
}
```

## State IDs

State IDs are stable four-digit strings:

```text
0001
0002
0003
```

These IDs are what MCP tools use.

## Paths

All image paths inside `trace.json` are relative to the trace folder and use forward slashes.

## Routes

Web captures store a human-readable `route` for each state when the page URL can be parsed. The route is the URL pathname plus search and hash, for example `/products/42?tab=details#pricing`. State labels include this route context, and frame filenames are still made safe through DeltaFrame's normal slugification.

## Metrics

`metrics.ratio` is:

```text
changedPixels / totalPixels
```

For UI work, tiny ratios can still matter. A validation message or button shift might be below 1% of pixels but still visually important.

## Diff Masks

`settings.masks` is optional. When present, each mask is a rectangle in screenshot pixel coordinates:

```json
{ "x": 0, "y": 0, "width": 160, "height": 40, "label": "clock" }
```

Masks are applied only to image diffing and changed-pixel metrics. Frame PNGs remain unmasked so the trace still shows the real UI. `metrics.totalPixels` excludes masked pixels, counting overlapping mask regions only once.

## Console Events

DeltaFrame stores warning/error console messages observed since the previous saved state. This helps connect visual states to runtime issues without turning the trace into a full browser log.

`state.console` remains the compatibility field for raw console diagnostics. Each event includes `type`, `text`, and `timestampMs`; events may also include `url` when the browser reports a source location.

## Network Diagnostics

`state.network` stores only failed requests and HTTP error responses observed since the previous saved state. Successful requests are not logged.

Network event types:

- `requestfailed`: a browser-level request failure such as connection refused or DNS failure.
- `http`: an HTTP response with status `400` or greater.

## Issue Groups

`state.issues` is a compact grouped summary derived from `state.console` and `state.network`. Groups are keyed by `source`, `type`, `message`, `url`, and `status`, then counted within the captured state.

Each issue group is JSON-friendly:

```json
{
  "source": "network",
  "type": "http",
  "message": "HTTP 500 Internal Server Error",
  "url": "http://localhost:3000/api/products/42",
  "status": 500,
  "count": 2,
  "firstTimestampMs": 1301,
  "lastTimestampMs": 1498
}
```
