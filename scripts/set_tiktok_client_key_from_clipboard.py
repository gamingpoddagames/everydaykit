#!/usr/bin/env python3
"""Install the TikTok Sandbox Client Key copied from the official developer portal.

Windows only. Copy the **Client key** with TikTok's Copy button first, then run:
  python scripts\\set_tiktok_client_key_from_clipboard.py

The key is never printed, saved to disk, or sent to ChatGPT/GitHub.
Only the owner-authorized Cloudflare 'everydaykit' Worker receives it as a secret.
"""
import ctypes
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
STATUS = "https://everydaykit.gamingpoddagames.workers.dev/freesignal/auth/status"
CF_UNICODETEXT = 13


def clipboard_text():
    """Read plaintext clipboard via PowerShell, avoiding ctypes on Python 3.14.

    TikTok Client Key is passed only in memory to Wrangler; the value is never
    printed or saved. PowerShell uses UTF-8 stdout to prevent cp1252 failures.
    """
    command = [
        "powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Get-Clipboard -Raw"
    ]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    if result.returncode != 0:
        raise RuntimeError("Windows clipboard could not be read. Copy the Client Key again.")
    try:
        clipboard = result.stdout.decode("utf-8-sig")
    except UnicodeError:
        raise RuntimeError("Clipboard text is not valid UTF-8.")
    # PowerShell may add one terminal line ending. Do not silently remove
    # other whitespace that could signal a copied placeholder.
    return clipboard.removesuffix("\r\n").removesuffix("\n")


def public_status():
    try:
        req = Request(STATUS + "?r=" + str(int(time.time())), headers={"Cache-Control": "no-store"})
        with urlopen(req, timeout=15) as response:
            return json.load(response)
    except Exception:
        return None


def main():
    if os.name != "nt":
        sys.exit("This helper only works on Windows.")
    if not (ROOT / "wrangler.jsonc").is_file():
        sys.exit("Run from the everydaykit GitHub clone containing wrangler.jsonc.")
    try:
        key = clipboard_text()
    except Exception as e:
        sys.exit("Clipboard error: " + str(e))
    # TikTok's exact key format is not documented. Check only obvious
    # copy/paste failures, without assuming a particular TikTok key prefix.
    if not key or len(key) < 10:
        sys.exit("NOT UPLOADED: clipboard text is too short. Click Copy next to Sandbox Client key.")
    if any(c in key for c in "\r\n\t ") or any(ord(c) < 33 or ord(c) > 126 for c in key):
        sys.exit("NOT UPLOADED: clipboard contains spaces, line breaks, or non-ASCII characters. Use TikTok's own Copy icon beside Client key.")
    if re.fullmatch(r"[*•●·xX]+", key):
        sys.exit("NOT UPLOADED: masked/placeholder characters instead of the real Client key.")
    if key.isdigit() and len(key) >= 15:
        sys.exit("NOT UPLOADED: this looks like a numeric App ID, not a Client key.")
    print("Clipboard Client Key looks well-formed (characters not displayed).")
    print("Uploading only TIKTOK_CLIENT_KEY to your Cloudflare everydaykit Worker...")
    payload = json.dumps({"TIKTOK_CLIENT_KEY": key}).encode("utf-8")
    try:
        r = subprocess.run(
            ["npx.cmd", "wrangler", "secret", "bulk", "--config", "wrangler.jsonc"],
            input=payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            cwd=ROOT, timeout=150, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        sys.exit("Wrangler failed to run: " + type(e).__name__)
    output = (r.stdout + b"\n" + r.stderr).decode("utf-8", errors="replace")
    output = output.replace(key, "[REDACTED]")
    if r.returncode != 0 or "TIKTOK_CLIENT_KEY" not in output:
        sys.exit("Cloudflare did not confirm upload. Safe log:\n" + output[-1800:])
    print("Cloudflare confirmed TIKTOK_CLIENT_KEY was processed.")
    for _ in range(4):
        time.sleep(3)
        data = public_status()
        if data and "client_key_format" in data:
            details = data["client_key_format"]
            print("Live configured:", data.get("configured"))
            print("Live key length band:", details.get("length_band"))
            print("Live key contains non-ASCII characters:", details.get("has_non_ascii_characters"))
            print("Live key contains whitespace:", details.get("has_whitespace_or_quotes"))
            if data.get("configured") and not details.get("has_non_ascii_characters") and details.get("length_band") != "under_10":
                print("SUCCESS: Cloudflare key copy/paste issue fixed.")
                print("Now open the FreeSignal Connect page to check whether TikTok recognizes this Sandbox key.")
                return
    print("Cloudflare upload confirmed, but live diagnostics have not yet updated.")
    print("Do not expose your key. Recheck /freesignal/auth/status after a short delay.")


if __name__ == "__main__":
    main()
