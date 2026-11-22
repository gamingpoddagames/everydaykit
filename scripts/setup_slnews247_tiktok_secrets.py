#!/usr/bin/env python3
"""Interactively install SL NEWS 24/7 Sandbox secrets in the existing Cloudflare Worker.

No credentials are logged, printed, committed or transmitted anywhere except
directly to Cloudflare using the official Wrangler CLI.
"""
import getpass
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
from urllib.request import Request, urlopen

WORKER = "everydaykit"
ACCOUNT = "bafe94987f554f78e0b6df8a3b3c113d"
STATUS = "https://everydaykit.gamingpoddagames.workers.dev/slnews247/auth/status"

def main():
    root = Path(__file__).resolve().parents[1]
    config = json.loads((root / "wrangler.jsonc").read_text(encoding="utf-8"))
    if config.get("name") != WORKER:
        sys.exit("Refusing to change a different Cloudflare Worker.")
    npx = shutil.which("npx.cmd") if os.name == "nt" else shutil.which("npx")
    if not npx:
        sys.exit("Node.js/npm is required. Install Node.js, then reopen CMD.")
    print("SL NEWS 24/7 TikTok Sandbox / Cloudflare secret setup")
    print("Worker:", WORKER)
    print("Client credentials must belong to World Video Publisher SANDBOX.")
    print("Never paste credentials into chat, logs, or GitHub issues.")
    print("If Wrangler requires login, run: npx wrangler login")
    print()
    values = []
    try:
        for name, prompt in [
            ("SLNEWS247_TIKTOK_CLIENT_KEY", "Sandbox Client Key"),
            ("SLNEWS247_TIKTOK_CLIENT_SECRET", "Sandbox Client Secret"),
        ]:
            value = getpass.getpass(prompt + " (hidden): ").strip()
            if not value or any(c.isspace() for c in value):
                sys.exit("Missing or invalid value for " + name + "; no secrets changed.")
            values.append((name, value))
        print()
        print("Generating a new secure 64-character Owner Admin Key automatically.")
        owner = secrets.token_hex(32)
        print("SAVE THIS PRIVATE KEY NOW (do not send it in chat or screenshots):")
        print(owner)
        print("You will need it when connecting your TikTok account.")
        saved = input("After storing the key securely, type SAVED and press Enter: ").strip()
        if saved != "SAVED":
            sys.exit("Cancelled. No secrets changed.")
        values.append(("SLNEWS247_OAUTH_ADMIN_KEY", owner))
        print()
        answer = input("Set exactly these 3 secrets on Cloudflare Worker everydaykit? Type YES: ").strip()
        if answer != "YES":
            sys.exit("Cancelled. No secrets changed.")
        env = dict(os.environ)
        env["CLOUDFLARE_ACCOUNT_ID"] = ACCOUNT
        for name, value in values:
            # stdin avoids passing secret values in the process command line.
            command = [npx, "--yes", "wrangler@4", "secret", "put", name, "--name", WORKER]
            completed = subprocess.run(command, input=(value + "\n").encode("utf-8"),
                                       cwd=root, env=env, stdout=subprocess.PIPE,
                                       stderr=subprocess.PIPE)
            if completed.returncode != 0:
                print("FAILED:", name)
                print("Wrangler command failed. Check Cloudflare login/account permissions.")
                print("Run 'npx wrangler login' and retry. Secret output was suppressed.")
                sys.exit(1)
            print("SAVED:", name)
        print("All 3 secret-write commands succeeded.")
        print("Check:", STATUS)
        try:
            req = Request(STATUS, headers={"User-Agent": "SLNews247-Safe-Setup/1.0"})
            with urlopen(req, timeout=15) as response:
                data = json.load(response)
            print("Cloudflare reports configured:", bool(data.get("configured")))
            if not data.get("configured"):
                print("Cloudflare may still be propagating. Check diagnostics after deployment.")
        except Exception:
            print("Status could not be checked automatically. Open the URL above.")
    finally:
        # Drop Python references as early as possible; never persist values.
        values.clear()

if __name__ == "__main__":
    main()
