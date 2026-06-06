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
      "console": []
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
      "console": []
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

## Console Events

DeltaFrame stores warning/error console messages observed since the previous saved state. This helps connect visual states to runtime issues without turning the trace into a full browser log.
