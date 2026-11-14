#!/usr/bin/env python3
"""Fix FreeSignal Cloudflare OAuth security keys without copying them into a terminal prompt.

Run from repository root:
  python scripts/repair_freesignal_keys.py

Only FREESIGNAL_OAUTH_ADMIN_KEY and TIKTOK_ENCRYPTION_SECRET are replaced.
Existing TikTok Sandbox client credentials are preserved.
The private admin key is stored in your user home, never in GitHub.
"""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
LOCAL_KEY_DIR = Path.home() / ".freesignal"
KEY_FILE = LOCAL_KEY_DIR / "oauth_admin_key.txt"
STATUS = "https://everydaykit.gamingpoddagames.workers.dev/freesignal/auth/status"


def main():
    if not (ROOT / "wrangler.jsonc").exists():
        sys.exit("Error: wrangler.jsonc not found in repo root.")
    if os.name != "nt":
        sys.exit("This helper currently supports Windows CMD (npx.cmd).")

    admin = secrets.token_urlsafe(48)
    encryption = secrets.token_urlsafe(48)
    if len(admin) < 32 or len(encryption) < 32 or admin == encryption:
        sys.exit("Error: failed security key generation.")

    LOCAL_KEY_DIR.mkdir(parents=True, exist_ok=True)
    # Store only the admin key, needed to connect account after repair.
    # Do not put this file in the repository, a screenshot, or a chat.
    KEY_FILE.write_text(admin, encoding="ascii")

    payload = json.dumps({
        "FREESIGNAL_OAUTH_ADMIN_KEY": admin,
        "TIKTOK_ENCRYPTION_SECRET": encryption,
    })
    print("Generated two separate 64-character security keys.", flush=True)
    print("Private Admin Key saved in your Windows user profile:", flush=True)
    print(str(KEY_FILE), flush=True)
    print("Uploading the two keys through Cloudflare Wrangler; other secrets are untouched...", flush=True)

    # Official Wrangler bulk API accepts JSON on standard input; it does not
    # require a plaintext temporary secrets file or a secret copied into CMD.
    try:
        result = subprocess.run(
            ["npx.cmd", "wrangler", "secret", "bulk", "--config", "wrangler.jsonc"],
            input=payload,
            text=True,
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=150,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        sys.exit("Wrangler failed to run: " + str(e))

    # Wrangler usually lists secret names, not contents. Avoid printing
    # arbitrary subprocess output verbatim in case a future version changes.
    if result.returncode != 0:
        msg = result.stderr or result.stdout
        msg = msg.replace(admin, "[REDACTED]").replace(encryption, "[REDACTED]")
        print("Wrangler returned an error (private keys redacted):", flush=True)
        print(msg[-2500:], flush=True)
        sys.exit(1)

    print("Cloudflare accepted the secret update.", flush=True)
    print("Checking the public, secret-free readiness endpoint...", flush=True)
    for attempt in range(5):
        try:
            req = Request(STATUS, headers={"Cache-Control": "no-cache"})
            with urlopen(req, timeout=12) as response:
                data = json.load(response)
            checks = data.get("checks", {})
            print("Configured:", data.get("configured"))
            print("Admin key valid:", checks.get("admin_key_valid"))
            print("Encryption key valid:", checks.get("encryption_key_valid"))
            print("KV ready:", checks.get("kv_storage"))
            if data.get("configured") is True:
                print("SUCCESS. Open the FreeSignal Connect page.")
                print("When asked for the private key, open your local file:", KEY_FILE)
                print("https://everydaykit.gamingpoddagames.workers.dev/freesignal/connect.html")
                return
        except Exception as exc:
            print("Readiness check unavailable:", type(exc).__name__, flush=True)
        if attempt < 4:
            time.sleep(3)
    print("Cloudflare accepted the keys, but readiness is not yet true.")
    print("Do not repeat the keys. Share only this status output (no private key).")
    sys.exit(2)


if __name__ == "__main__":
    main()
