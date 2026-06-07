# Desktop Capture

DeltaFrame desktop capture is local-only and optional. It uses a Python `mss` backend to grab pixels from a monitor, absolute region, or visible native Windows window.

## Install Backend

Install `mss` in the Python environment DeltaFrame will use:

```bash
python -m pip install mss
```

Check the backend:

```bash
deltaframe doctor --desktop
deltaframe desktop --list
```

If DeltaFrame cannot find the right Python executable, pass it explicitly:

```bash
deltaframe desktop --list --python /path/to/python
```

## Capture Modes

Selected region:

```bash
deltaframe desktop --region 0,0,1200,800 --name region-flow
```

Selected monitor:

```bash
deltaframe desktop --monitor 1 --name monitor-flow
```

Selected window by title substring, native Windows only:

```bash
deltaframe desktop --window-title "Prototype" --name prototype-window
```

## Privacy

Use redactions for private pixels that should never be written to trace files:

```bash
deltaframe desktop --monitor 1 --redact '[{"x":0,"y":0,"width":320,"height":120,"label":"account"}]'
```

`--mask` only ignores a region while calculating visual change. `--redact` blackens that region in saved screenshots before diffing and before writing `frames/` or `diffs/`.

## Platform Notes

Windows:

- Monitor and region capture work through native Python plus `mss`.
- Window-title capture uses Win32 window bounds and captures the resulting rectangle with `mss`.
- If display scaling causes offsets, run the same Python executable natively on Windows rather than through WSL.

macOS:

- Grant Screen Recording permission to the Python executable used by DeltaFrame.
- Region and monitor capture are the supported modes.
- Window-title capture is not implemented on macOS in this local backend.

Linux:

- X11 sessions are the best-supported path for `mss`.
- Wayland compositors may block global screen capture or require portal-specific tooling.
- Region and monitor capture depend on what the desktop session exposes to Python.

WSL:

- A Linux Python inside WSL usually cannot see the Windows desktop.
- Prefer running DeltaFrame from native Windows Node/Python for desktop capture, or pass a Windows-host Python executable with `--python` when that path works in your shell.
- Web capture through Playwright can still run in WSL as before.

## Trace Output

Desktop traces use the same folder structure as web traces:

```text
trace.json
summary.md
frames/
diffs/
```

The trace records `source.type: "desktop"`, the capture mode, backend, platform, monitor/window/region metadata, and any `settings.redactions` that were applied.
