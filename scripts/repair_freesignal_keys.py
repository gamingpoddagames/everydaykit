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
            input=payload.encode("utf-8"),
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=150,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        sys.exit("Wrangler failed to run: " + str(e))

    # Read raw bytes so Windows cp1252 consoles cannot crash on Wrangler Unicode output.
    stdout = result.stdout.decode("utf-8", errors="replace")
    stderr = result.stderr.decode("utf-8", errors="replace")
    safe_output = (stdout + "\\n" + stderr).replace(admin, "[REDACTED]").replace(encryption, "[REDACTED]")
    if result.returncode != 0:
        print("Wrangler command FAILED (no success assumed):", flush=True)
        print(safe_output[-2500:], flush=True)
        sys.exit(1)
    expected_names = ("FREESIGNAL_OAUTH_ADMIN_KEY", "TIKTOK_ENCRYPTION_SECRET")
    if not all(name in safe_output for name in expected_names):
        print("Wrangler exited successfully but did not confirm both secret names.", flush=True)
        print(safe_output[-2000:], flush=True)
        sys.exit(1)
    print("Wrangler confirmed both requested secret keys were processed.", flush=True)
    print("Checking the public, secret-free readiness endpoint...", flush=True)
    for attempt in range(5):
        # curl.exe uses Windows native HTTP stack/Cloudflare routing; unlike urllib,
        # it does not raise HTTPError just because the server returns 4xx/5xx.
        try:
            check = subprocess.run(
                ["curl.exe", "-sS", "-L", "--max-time", "15", "-H", "Cache-Control: no-cache", STATUS],
                cwd=ROOT, capture_output=True, timeout=22, check=False,
            )
            body = check.stdout.decode("utf-8", errors="replace")
            if check.returncode:
                print("Readiness HTTP check failed (curl exit):", check.returncode)
            else:
                try:
                    data = json.loads(body)
                    checks = data.get("checks", {})
                    print("Configured:", data.get("configured"))
                    print("Admin key valid:", checks.get("admin_key_valid"))
                    print("Encryption key valid:", checks.get("encryption_key_valid"))
                    print("KV ready:", checks.get("kv_storage"))
                    if data.get("configured") is True:
                        print("SUCCESS. Open the FreeSignal Connect page.")
                        print("Use the Admin Key saved locally in:", KEY_FILE)
                        print("https://everydaykit.gamingpoddagames.workers.dev/freesignal/connect.html")
                        return
                except (ValueError, AttributeError):
                    print("Readiness endpoint did not return JSON. Check Cloudflare deployment.")
        except (OSError, subprocess.TimeoutExpired) as exc:
            print("Readiness check failed:", type(exc).__name__)
        if attempt < 4:
            time.sleep(3)
    print("Secrets were processed, but live readiness is not confirmed.")
    print("Do not repeat the keys. Share only this status output (no private key).")
    sys.exit(2)


if __name__ == "__main__":
    main()
