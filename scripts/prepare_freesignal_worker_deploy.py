"""Prepare a direct deployment of the existing EverydayKit Worker.

Only metadata for the exact existing Worker is read. Secret values are never
printed or copied into configuration, and an existing KV namespace is required.
"""
import argparse
from copy import deepcopy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

ACCOUNT = "bafe94987f554f78e0b6df8a3b3c113d"
WORKER = "everydaykit"
ORIGIN = "https://everydaykit.gamingpoddagames.workers.dev"
CONFIG = Path("wrangler.jsonc")
GENERATED = Path(".freesignal-wrangler.deploy.json")
SETTINGS_URL = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{WORKER}/settings"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward a Cloudflare credential to another host.
        return None


def prepare_config(config, settings):
    if config.get("name") != WORKER or config.get("main") != "src/worker.js":
        raise RuntimeError("Refusing a deployment to an unexpected Worker or entry point")
    if config.get("account_id") not in (None, ACCOUNT):
        raise RuntimeError("Refusing a deployment to an unexpected Cloudflare account")
    assets = config.get("assets", {})
    if assets.get("directory") != "./dist" or assets.get("binding") != "ASSETS":
        raise RuntimeError("Existing static-site asset configuration must be retained")
    namespaces = config.get("kv_namespaces", [])
    if len(namespaces) != 1 or namespaces[0].get("binding") != "TIKTOK_AUTH":
        raise RuntimeError("Existing authentication KV binding is ambiguous")
    bindings = settings.get("bindings", [])
    matching = [b for b in bindings if b.get("name") == "TIKTOK_AUTH" and b.get("type") == "kv_namespace"]
    if len(matching) != 1:
        raise RuntimeError("The existing Worker authentication KV binding was not found; no namespace will be created")
    namespace_id = matching[0].get("namespace_id", "")
    if not isinstance(namespace_id, str) or not re.fullmatch(r"[a-fA-F0-9]{32}", namespace_id):
        raise RuntimeError("The existing KV namespace metadata is invalid")
    if namespaces[0].get("id") not in (None, namespace_id):
        raise RuntimeError("Source KV namespace and existing live binding disagree")
    result = deepcopy(config)
    result["account_id"] = ACCOUNT
    result["keep_vars"] = True
    result["kv_namespaces"][0]["id"] = namespace_id
    # Do not copy any remote plain-text or secret binding values.
    return result


def existing_settings(token):
    request = Request(SETTINGS_URL, headers={
        "Authorization": "Bearer " + token,
        "User-Agent": "FreeSignal-Worker-Deployment/1.0",
        "Accept": "application/json",
    })
    try:
        with build_opener(NoRedirect()).open(request, timeout=40) as response:
            payload = response.read(2 * 1024 * 1024 + 1)
        if len(payload) > 2 * 1024 * 1024:
            raise RuntimeError("Cloudflare metadata response was unexpectedly large")
        data = json.loads(payload)
    except HTTPError as error:
        raise RuntimeError(f"Cloudflare access check failed (HTTP {error.code}); check the scoped token and account access") from None
    except (URLError, TimeoutError, ValueError, OSError):
        raise RuntimeError("Cloudflare metadata request failed") from None
    if data.get("success") is not True or not isinstance(data.get("result"), dict):
        raise RuntimeError("Cloudflare did not confirm the existing Worker metadata")
    return data["result"]


def media_preflight_ok(status, payload):
    try:
        return status == 403 and json.loads(payload).get("error") == "unauthorized_workflow"
    except (ValueError, AttributeError):
        return False


def public_request(path, method="GET"):
    request = Request(ORIGIN + path, data=b"" if method == "POST" else None,
                      method=method, headers={"User-Agent": "FreeSignal-Deployment-Verification/1.0"})
    try:
        with build_opener(NoRedirect()).open(request, timeout=20) as response:
            return response.status, response.read(4 * 1024 * 1024)
    except HTTPError as error:
        return error.code, error.read(8192)


def verify_live():
    for attempt in range(6):
        try:
            status, payload = public_request("/freesignal/api/buffer/media-upload", "POST")
            if media_preflight_ok(status, payload):
                break
        except (URLError, TimeoutError, OSError):
            pass
        if attempt == 5:
            raise RuntimeError("Deployment not verified: live media route must reject anonymous writes")
        time.sleep(5)
    # Static Assets serves individual HTML files at extensionless canonical URLs.
    # Keep redirects disabled, especially for authenticated Cloudflare requests.
    for path in ("/", "/freesignal/", "/freesignal/privacy", "/freesignal/terms"):
        status, body = public_request(path)
        if status != 200 or b"<html" not in body.lower():
            raise RuntimeError(f"Deployment not verified: public site page {path} did not return HTML (HTTP {status})")
    missing = "/freesignal/api/public-video/2000-01-01/" + "0" * 64 + ".mp4"
    status, payload = public_request(missing)
    if status != 404:
        raise RuntimeError("Deployment not verified: a missing public video must return 404")
    output = Path("promotion_output")
    output.mkdir(exist_ok=True)
    receipt = {"worker": WORKER, "origin": ORIGIN,
               "checked_at": datetime.now(timezone.utc).isoformat(),
               "status": "LIVE_MEDIA_AUTHORIZATION_AND_SITE_VERIFIED",
               "original_mp4_upload": "verify separately from the authorized private publisher"}
    (output / "direct_worker_deploy_receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print("PASS: live FreeSignal media authorization, missing-video protection and existing public site verified")


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--prepare", action="store_true")
    mode.add_argument("--verify-live", action="store_true")
    args = parser.parse_args()
    if args.verify_live:
        verify_live()
        return
    token = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
    if not token:
        raise RuntimeError("SETUP_PENDING: store CLOUDFLARE_API_TOKEN in gamingpoddagames/everydaykit Actions secrets; never send it in chat")
    if any(c.isspace() for c in token):
        raise RuntimeError("Cloudflare token format is invalid; use only the token value in the secret")
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    prepared = prepare_config(config, existing_settings(token))
    GENERATED.write_text(json.dumps(prepared, indent=2) + "\n", encoding="utf-8")
    print("PASS: exact Cloudflare account and existing Worker binding verified; existing variables and secrets retained")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError, KeyError) as error:
        if isinstance(error, RuntimeError):
            raise SystemExit(str(error)) from None
        raise SystemExit("Worker deployment preparation or verification failed; no credential values were logged") from None
