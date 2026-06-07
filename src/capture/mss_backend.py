#!/usr/bin/env python3
import argparse
import base64
import ctypes
import json
import platform
import sys


def main():
    parser = argparse.ArgumentParser(description="DeltaFrame optional desktop capture backend.")
    subcommands = parser.add_subparsers(dest="command", required=True)

    subcommands.add_parser("list", help="List monitors visible to MSS.")

    windows = subcommands.add_parser("windows", help="List visible windows when supported.")
    windows.add_argument("--title", default="", help="Optional case-insensitive title filter.")

    capture = subcommands.add_parser("capture", help="Capture a monitor, region, or window.")
    capture.add_argument("--monitor", type=int, default=None, help="MSS monitor index. 0 is the virtual desktop.")
    capture.add_argument("--region", default="", help="Absolute screen region as x,y,width,height.")
    capture.add_argument("--window-title", default="", help="Visible window title substring. Windows only.")

    args = parser.parse_args()

    if args.command == "list":
        print_json({"ok": True, "platform": platform.system(), "monitors": list_monitors()})
        return

    if args.command == "windows":
        print_json({
            "ok": True,
            "platform": platform.system(),
            "windows": list_windows(args.title)
        })
        return

    if args.command == "capture":
        print_json(capture_screen(args))
        return


def load_mss():
    try:
        import mss
        import mss.tools
        return mss
    except ImportError as error:
        raise RuntimeError(
            "Missing Python package mss. Install it with: python -m pip install mss"
        ) from error


def list_monitors():
    mss = load_mss()
    with mss.mss() as sct:
        return [
            {
                "index": index,
                "left": int(monitor["left"]),
                "top": int(monitor["top"]),
                "width": int(monitor["width"]),
                "height": int(monitor["height"]),
                "virtual": index == 0
            }
            for index, monitor in enumerate(sct.monitors)
        ]


def capture_screen(args):
    mss = load_mss()
    with mss.mss() as sct:
        target = resolve_capture_box(args, sct.monitors)
        image = sct.grab(target["box"])
        png = mss.tools.to_png(image.rgb, image.size)
        return {
            "ok": True,
            "platform": platform.system(),
            "backend": "mss",
            "mode": target["mode"],
            "monitorIndex": target.get("monitorIndex"),
            "window": target.get("window"),
            "region": {
                "x": int(target["box"]["left"]),
                "y": int(target["box"]["top"]),
                "width": int(target["box"]["width"]),
                "height": int(target["box"]["height"])
            },
            "png": base64.b64encode(png).decode("ascii")
        }


def resolve_capture_box(args, monitors):
    if args.window_title:
        window = find_window(args.window_title)
        box = {
            "left": window["x"],
            "top": window["y"],
            "width": window["width"],
            "height": window["height"]
        }
        return {"mode": "window", "box": box, "window": window}

    if args.region:
        return {"mode": "region", "box": parse_region(args.region)}

    monitor_index = args.monitor if args.monitor is not None else (1 if len(monitors) > 1 else 0)
    if monitor_index < 0 or monitor_index >= len(monitors):
        raise RuntimeError(f"Monitor index {monitor_index} is not available.")
    monitor = monitors[monitor_index]
    return {
        "mode": "monitor",
        "monitorIndex": monitor_index,
        "box": {
            "left": int(monitor["left"]),
            "top": int(monitor["top"]),
            "width": int(monitor["width"]),
            "height": int(monitor["height"])
        }
    }


def parse_region(value):
    parts = [part.strip() for part in value.split(",")]
    if len(parts) != 4:
        raise RuntimeError("Region must be x,y,width,height.")
    try:
        x, y, width, height = [int(part) for part in parts]
    except ValueError as error:
        raise RuntimeError("Region must contain integers: x,y,width,height.") from error
    if width <= 0 or height <= 0:
        raise RuntimeError("Region width and height must be positive.")
    return {"left": x, "top": y, "width": width, "height": height}


def list_windows(title_filter=""):
    if platform.system() != "Windows":
        return []
    ensure_dpi_aware()
    user32 = ctypes.windll.user32
    windows = []
    title_filter = title_filter.casefold()

    def callback(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return True
        buffer = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buffer, length + 1)
        title = buffer.value.strip()
        if not title:
            return True
        if title_filter and title_filter not in title.casefold():
            return True
        rect = RECT()
        if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
            return True
        width = rect.right - rect.left
        height = rect.bottom - rect.top
        if width <= 0 or height <= 0:
            return True
        windows.append({
            "handle": int(hwnd),
            "title": title,
            "x": int(rect.left),
            "y": int(rect.top),
            "width": int(width),
            "height": int(height)
        })
        return True

    enum_proc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)(callback)
    user32.EnumWindows(enum_proc, 0)
    return windows


def find_window(title):
    matches = list_windows(title)
    if not matches:
        if platform.system() == "Windows":
            raise RuntimeError(f"No visible window matched title: {title}")
        raise RuntimeError("Window-title capture is currently supported only on native Windows.")
    return matches[0]


class RECT(ctypes.Structure):
    _fields_ = [
        ("left", ctypes.c_long),
        ("top", ctypes.c_long),
        ("right", ctypes.c_long),
        ("bottom", ctypes.c_long)
    ]


def ensure_dpi_aware():
    if platform.system() != "Windows":
        return
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass


def print_json(value):
    print(json.dumps(value, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
