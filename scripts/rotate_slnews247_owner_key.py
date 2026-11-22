#!/usr/bin/env python3
"""Rotate only SL NEWS 24/7 owner admin secret; no CMD paste needed.

The new key is generated using Python's cryptographic secrets module.
It is sent to Wrangler via stdin, not included in command arguments.
Client credentials, encryption keys and FreeSignal records are untouched.
"""
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
from urllib.request import Request, urlopen

WORKER = "everydaykit"
ACCOUNT = "bafe94987f554f78e0b6df8a3b3c113d"
URL = "https://everydaykit.gamingpoddagames.workers.dev/slnews247/auth/status"
NAME = "SLNEWS247_OAUTH_ADMIN_KEY"

def check():
    try:
        req = Request(URL + "?v=" + str(int(time.time())), headers={
            "User-Agent": "SLNews247-AdminKey-Check",
            "Cache-Control": "no-cache",
        })
        with urlopen(req, timeout=15) as response:
            return json.load(response)
    except (OSError, ValueError) as e:
        return {"error": type(e).__name__}

def main():
    root = Path(__file__).resolve().parents[1]
    cfg = json.loads((root / "wrangler.jsonc").read_text(encoding="utf-8"))
    if cfg.get("name") != WORKER:
        sys.exit("Worker does not match everydaykit; no changes made.")
    npx = shutil.which("npx.cmd" if os.name == "nt" else "npx")
    if not npx:
        sys.exit("Node.js and npx are required.")
    print("Rotating only SLNEWS247_OAUTH_ADMIN_KEY on Cloudflare Worker everydaykit.")
    print("Other TikTok secrets and FreeSignal secrets will not be changed.")
    if input("Type YES to proceed: ").strip() != "YES":
        sys.exit("Cancelled.")
    key = secrets.token_hex(32)
    assert len(key) == 64
    env = os.environ.copy()
    env["CLOUDFLARE_ACCOUNT_ID"] = ACCOUNT
    result = subprocess.run(
        [npx, "--yes", "wrangler@4", "secret", "put", NAME, "--name", WORKER],
        input=(key + "\n").encode("ascii"),
        cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if result.returncode:
        print("Cloudflare upload failed; secret was not confirmed.")
        print("Try 'npx wrangler login' and run this script again.")
        sys.exit(1)
    # Confirm from public readiness endpoint before displaying the key.
    payload = None
    for attempt in range(6):
        payload = check()
        if payload.get("checks", {}).get("owner_key_valid") is True:
            break
        time.sleep(3)
    print("Wrangler command completed successfully.")
    print("owner_key_valid:", payload.get("checks", {}).get("owner_key_valid", "unknown"))
    print("configured:", payload.get("configured", "unknown"))
    if payload.get("checks", {}).get("owner_key_valid") is not True:
        print("Warning: live Worker did not yet confirm a valid owner key.")
        print("This may indicate Wrangler wrote an empty input, wrong account, or propagation issue.")
        print("Check Cloudflare > Workers > everydaykit > Settings > Variables and Secrets.")
        print("Do not start TikTok Login until owner_key_valid is true.")
    print()
    print("YOUR NEW OWNER ADMIN KEY (SAVE PRIVATELY; DO NOT SEND TO CHAT):")
    print(key)
    print("Keep this key in a password manager. It is needed for the Connect TikTok page.")
    print("Status URL:", URL)

if __name__ == "__main__":
    main()
