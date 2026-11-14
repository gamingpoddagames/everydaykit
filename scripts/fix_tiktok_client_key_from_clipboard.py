#!/usr/bin/env python3
"""Copy the TikTok Sandbox *Client Key* using TikTok's copy icon, then run:
    python scripts\\fix_tiktok_client_key_from_clipboard.py

This program never prints or saves the key. It validates the Windows clipboard
locally, uploads a single secret to the existing Cloudflare Worker and verifies
the public metadata-only diagnostics. Existing unrelated secrets are preserved.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.request import urlopen, Request

ROOT = Path(__file__).resolve().parents[1]
STATUS = "https://everydaykit.gamingpoddagames.workers.dev/freesignal/auth/status"

def windows_clipboard():
    # OS clipboard via PowerShell; bytes decoded as UTF-8 to avoid Windows cp1252 issues.
    cmd = ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
           "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard -Raw"]
    result = subprocess.run(cmd, capture_output=True, timeout=15)
    if result.returncode:
        raise RuntimeError("Could not access Windows clipboard. Use TikTok's Copy icon again.")
    return result.stdout.decode("utf-8-sig", errors="strict").rstrip("\r\n")

def validate(key):
    if not key:
        return "Clipboard empty. Copy the TikTok Sandbox Client Key with its Copy icon."
    if len(key) < 10:
        return "Clipboard text is too short for this app key. Possibly copying masked text or a placeholder."
    if key.isdecimal() and len(key) >= 15:
        return "This looks like a numeric App ID, not the Client Key. Copy the Client Key field instead."
    if len(key) > 150:
        return "Clipboard is too long to be a Client Key. Copy only the Client Key field."
    if any(ord(c) > 127 or ord(c) < 33 for c in key):
        return "Clipboard contains hidden, non-ASCII or whitespace characters. Copy the key using the TikTok Copy icon."
    if not all(c.isalnum() or c in "_-" for c in key):
        return "Clipboard includes unexpected symbols. Confirm you copied the Client Key rather than masked characters."
    return None

def main():
    if os.name != "nt":
        sys.exit("This helper runs on Windows.")
    if not (ROOT / "wrangler.jsonc").exists():
        sys.exit("Run this script from the EverydayKit repository.")
    try:
        key = windows_clipboard()
    except (Exception,) as exc:
        sys.exit("Clipboard read failed: " + str(exc))
    failure = validate(key)
    if failure:
        sys.exit("NOT UPLOADED: " + failure + "\nNo Cloudflare secrets were changed.")
    print("Clipboard Client Key passes basic local checks. No key value will be printed.", flush=True)
    data = json.dumps({"TIKTOK_CLIENT_KEY": key}).encode("utf-8")
    try:
        r = subprocess.run(
            ["npx.cmd", "wrangler", "secret", "bulk", "--config", "wrangler.jsonc"],
            input=data, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=180, check=False
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        sys.exit("Cloudflare upload failed to launch: " + type(e).__name__)
    output = (r.stdout + b"\n" + r.stderr).decode("utf-8", errors="replace").replace(key, "[REDACTED]")
    if r.returncode != 0 or "TIKTOK_CLIENT_KEY" not in output:
        sys.exit("Cloudflare did not confirm the Client Key update. Wrangler exit code: " + str(r.returncode) + "\n" + output[-1800:])
    print("Cloudflare confirmed TIKTOK_CLIENT_KEY was processed.", flush=True)
    print("Checking public readiness (no secrets revealed)...", flush=True)
    try:
        req = Request(STATUS, headers={"Cache-Control":"no-cache"})
        with urlopen(req,timeout=20) as resp:
            status = json.load(resp)
        print("OAuth configured:", status.get("configured"))
        d=status.get("client_key_format", {})
        for k in ("plausible","length_band","has_non_ascii_characters","has_non_alphanumeric_symbols"):
            if k in d: print(k + ":",d[k])
        if d.get("has_non_ascii_characters") is False and d.get("length_band") != "under_10":
            print("Client Key format checks improved. Retry TikTok Login. Format alone cannot confirm TikTok accepts this key.")
    except Exception as e:
        print("Cloudflare upload was confirmed; status request could not be checked:",type(e).__name__)
    print("Connect page: https://everydaykit.gamingpoddagames.workers.dev/freesignal/connect.html")

if __name__=="__main__":
    main()
