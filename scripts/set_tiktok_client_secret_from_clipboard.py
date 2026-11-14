#!/usr/bin/env python3
"""Set only the TikTok Sandbox Client Secret from the Windows clipboard.

Open TikTok Developer Portal > FreeSignal Video Publisher > Sandbox >
FreeSignal Testing > App details > Credentials. Reveal the *Client Secret*
with the eye icon, select the actual secret text and Ctrl+C. Then run:
    python scripts\\set_tiktok_client_secret_from_clipboard.py

The secret is never displayed, logged, or written to a file. The script
preserves all other Cloudflare secrets, including the working Client Key.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]

def get_clipboard():
    p=subprocess.run(
        ["powershell.exe","-NoProfile","-NonInteractive","-Command",
         "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Get-Clipboard -Raw"],
        stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20,check=False
    )
    if p.returncode: raise RuntimeError("Cannot read Windows clipboard.")
    return p.stdout.decode("utf-8-sig").removesuffix("\r\n").removesuffix("\n")

def main():
    if os.name!="nt" or not (ROOT/"wrangler.jsonc").exists():
        sys.exit("Run from your Windows EverydayKit repository folder.")
    try: secret=get_clipboard()
    except (OSError,ValueError,UnicodeError,subprocess.TimeoutExpired,RuntimeError) as e:
        sys.exit("Clipboard read failed: "+type(e).__name__)
    if len(secret)<10 or len(secret)>256:
        sys.exit("NOT UPLOADED: copied text has an unexpected length. Reveal the actual Sandbox Client Secret and copy its full value.")
    if any(ord(c)<33 or ord(c)>126 for c in secret):
        sys.exit("NOT UPLOADED: copied text includes masked dots, spaces or non-ASCII characters. Reveal the actual Client Secret with the eye icon.")
    if set(secret).issubset(set("*•●·xX")):
        sys.exit("NOT UPLOADED: masked placeholder copied instead of real Client Secret.")
    if secret.isdigit() and len(secret)>=15:
        sys.exit("NOT UPLOADED: numeric App ID copied instead of Client Secret.")
    print("Clipboard passes basic checks; uploading only TIKTOK_CLIENT_SECRET (value hidden).",flush=True)
    payload=json.dumps({"TIKTOK_CLIENT_SECRET":secret}).encode("utf-8")
    try:
        p=subprocess.run(
            ["npx.cmd","wrangler","secret","bulk","--config","wrangler.jsonc"],
            input=payload,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
            cwd=ROOT,timeout=160,check=False
        )
    except (OSError,subprocess.TimeoutExpired) as e:
        sys.exit("Wrangler failed: "+type(e).__name__)
    stdout=p.stdout.decode("utf-8",errors="replace")
    stderr=p.stderr.decode("utf-8",errors="replace")
    safe=(stdout+"\n"+stderr).replace(secret,"[REDACTED]")
    if p.returncode or "TIKTOK_CLIENT_SECRET" not in safe:
        sys.exit("Cloudflare did not confirm secret upload. Exit code: "+str(p.returncode)+"\n"+safe[-1600:])
    print("SUCCESS: Cloudflare confirmed the Sandbox Client Secret was processed.",flush=True)
    print("The existing Client Key, OAuth Admin Key and Encryption Secret were not changed.")
    print("Start a NEW TikTok login attempt (do not refresh an old OAuth callback):")
    print("https://everydaykit.gamingpoddagames.workers.dev/freesignal/connect.html")

if __name__=="__main__": main()
