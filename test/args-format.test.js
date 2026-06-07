import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs } from "../src/utils/args.js";
import {
  padNumber,
  labelWithRoute,
  parseRegion,
  parseViewport,
  routeFromUrl,
  slugify,
  timestampSlug,
  toPosixPath
} from "../src/utils/format.js";

test("parseArgs separates command, flags, and positionals", () => {
  assert.deepEqual(
    parseArgs([
      "watch",
      "--url",
      "http://localhost:3000",
      "--name=Landing Flow",
      "-vh",
      "extra"
    ]),
    {
      command: "watch",
      flags: {
        url: "http://localhost:3000",
        name: "Landing Flow",
        v: true,
        h: true
      },
      positionals: ["extra"]
    }
  );
});

test("parseArgs preserves values after -- as positionals", () => {
  assert.deepEqual(parseArgs(["review", "--", "--not-a-flag", "trace-dir"]), {
    command: "review",
    flags: {},
    positionals: ["--not-a-flag", "trace-dir"]
  });
});

test("format helpers produce stable trace-friendly values", () => {
  assert.equal(padNumber(7), "0007");
  assert.equal(slugify("  Landing Flow: Step #2!  "), "landing-flow-step-2");
  assert.equal(slugify("!!!", "fallback"), "fallback");
  assert.equal(routeFromUrl("http://localhost:3000"), "/");
  assert.equal(routeFromUrl("http://localhost:3000/products/42?tab=details#pricing"), "/products/42?tab=details#pricing");
  assert.equal(routeFromUrl("not a url"), "");
  assert.equal(labelWithRoute("initial", "http://localhost:3000/products/42?tab=details#pricing"), "initial /products/42?tab=details#pricing");
  assert.equal(labelWithRoute("changed-001234ms", "not a url"), "changed-001234ms");
  assert.equal(slugify(labelWithRoute("initial", "http://localhost:3000/products/42?tab=details#pricing")), "initial-products-42-tab-details-pricing");
  assert.equal(timestampSlug(new Date("2026-06-06T17:04:05.123Z")), "2026-06-06-17-04-05");
  assert.equal(toPosixPath("frames\\0001.png"), "frames/0001.png");
});

test("parseViewport accepts WIDTHxHEIGHT and rejects invalid input", () => {
  assert.deepEqual(parseViewport("1440x900"), { width: 1440, height: 900 });
  assert.throws(
    () => parseViewport("wide"),
    /Invalid viewport "wide"/
  );
});

test("parseRegion accepts x,y,width,height and rejects invalid input", () => {
  assert.deepEqual(parseRegion("-10,20,300,400"), {
    x: -10,
    y: 20,
    width: 300,
    height: 400
  });
  assert.throws(
    () => parseRegion("0,0,0,400"),
    /Width and height must be positive/
  );
  assert.throws(
    () => parseRegion("0,0,400"),
    /Invalid region/
  );
});
