import { sleep as defaultSleep } from "../utils/format.js";

export function createCaptureControl() {
  let paused = false;
  let stopRequested = false;
  const listeners = new Set();

  function emit(event) {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function setPaused(nextPaused) {
    if (stopRequested || paused === nextPaused) return paused;
    paused = nextPaused;
    emit(paused ? "paused" : "resumed");
    return paused;
  }

  return {
    isPaused() {
      return paused;
    },
    shouldStop() {
      return stopRequested;
    },
    pause() {
      return setPaused(true);
    },
    resume() {
      return setPaused(false);
    },
    togglePause() {
      return setPaused(!paused);
    },
    requestStop() {
      if (stopRequested) return;
      stopRequested = true;
      paused = false;
      emit("stopped");
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async waitWhilePaused({ sleep = defaultSleep, pollMs = 50 } = {}) {
      while (paused && !stopRequested) {
        await sleep(pollMs);
      }
    }
  };
}

export function createTerminalCaptureControl({
  input = process.stdin,
  output = process.stderr
} = {}) {
  const control = createCaptureControl();
  let cleanupChangeListener = () => {};
  let listening = false;
  let previousRawMode = false;

  function write(message) {
    output?.write?.(`[deltaframe] ${message}\n`);
  }

  function handleData(chunk) {
    for (const key of String(chunk)) {
      const normalized = key.toLowerCase();
      if (key === "\u0003") {
        control.requestStop();
        continue;
      }
      if (normalized === "q") {
        control.requestStop();
        continue;
      }
      if (normalized === "p") {
        control.togglePause();
      }
    }
  }

  return {
    ...control,
    start() {
      if (listening) return;
      listening = true;
      previousRawMode = Boolean(input?.isRaw);
      cleanupChangeListener = control.onChange((event) => {
        if (event === "paused") write("capture paused");
        if (event === "resumed") write("capture resumed");
        if (event === "stopped") write("stopping capture");
      });
      write("controls: p pause/resume, q stop, Ctrl+C stop");
      input?.setRawMode?.(true);
      input?.resume?.();
      input?.on?.("data", handleData);
    },
    cleanup() {
      if (!listening) return;
      listening = false;
      input?.off?.("data", handleData);
      input?.setRawMode?.(previousRawMode);
      cleanupChangeListener();
      cleanupChangeListener = () => {};
    }
  };
}
