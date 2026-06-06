import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  createCaptureControl,
  createTerminalCaptureControl
} from "../src/capture/terminalControls.js";

test("capture control waits while paused and resumes without stopping", async () => {
  const control = createCaptureControl();
  let polls = 0;

  control.pause();
  await control.waitWhilePaused({
    pollMs: 1,
    sleep: async () => {
      polls += 1;
      if (polls === 3) control.resume();
    }
  });

  assert.equal(polls, 3);
  assert.equal(control.isPaused(), false);
  assert.equal(control.shouldStop(), false);
});

test("capture control stop request releases paused waits", async () => {
  const control = createCaptureControl();
  const events = [];
  control.onChange((event) => events.push(event));

  control.pause();
  await control.waitWhilePaused({
    pollMs: 1,
    sleep: async () => {
      control.requestStop();
    }
  });

  assert.equal(control.isPaused(), false);
  assert.equal(control.shouldStop(), true);
  assert.deepEqual(events, ["paused", "stopped"]);
});

test("terminal capture control handles p, q, and cleanup", () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const control = createTerminalCaptureControl({ input, output });

  control.start();
  input.emit("data", Buffer.from("p"));
  assert.equal(control.isPaused(), true);
  input.emit("data", Buffer.from("P"));
  assert.equal(control.isPaused(), false);
  input.emit("data", Buffer.from("q"));
  assert.equal(control.shouldStop(), true);
  control.cleanup();

  assert.deepEqual(input.rawModes, [true, false]);
  assert.match(output.text, /controls: p pause\/resume, q stop, Ctrl\+C stop/);
  assert.match(output.text, /capture paused/);
  assert.match(output.text, /capture resumed/);
  assert.match(output.text, /stopping capture/);
});

class FakeInput extends EventEmitter {
  constructor() {
    super();
    this.isRaw = false;
    this.rawModes = [];
  }

  setRawMode(value) {
    this.isRaw = value;
    this.rawModes.push(value);
  }

  resume() {}
}

class FakeOutput {
  constructor() {
    this.text = "";
  }

  write(chunk) {
    this.text += chunk;
  }
}
