"""Checks that direct deployment cannot replace the authentication namespace."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location("deploy", Path(__file__).with_name("prepare_freesignal_worker_deploy.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
config = {"name": "everydaykit", "main": "src/worker.js",
          "assets": {"directory": "./dist", "binding": "ASSETS"},
          "kv_namespaces": [{"binding": "TIKTOK_AUTH"}]}
namespace_id = "a" * 32
settings = {"bindings": [
    {"type": "kv_namespace", "name": "TIKTOK_AUTH", "namespace_id": namespace_id},
    {"type": "secret_text", "name": "EXISTING_SECRET", "text": "DO_NOT_COPY_REMOTE_SECRET"},
    {"type": "plain_text", "name": "EXISTING_PRIVATE_VAR", "text": "DO_NOT_COPY_REMOTE_VAR"},
]}
prepared = module.prepare_config(config, settings)
assert prepared["account_id"] == module.ACCOUNT
assert prepared["keep_vars"] is True
assert prepared["kv_namespaces"][0]["id"] == namespace_id
assert config["kv_namespaces"][0].get("id") is None
assert "DO_NOT_COPY" not in json.dumps(prepared)
for candidate in [
    dict(config, name="unrelated-worker"),
    dict(config, main="untrusted.js"),
    dict(config, account_id="b" * 32),
    dict(config, kv_namespaces=[]),
    dict(config, kv_namespaces=[{"binding": "TIKTOK_AUTH", "id": "b" * 32}]),
    dict(config, assets={"directory": "./wrong", "binding": "ASSETS"}),
]:
    try:
        module.prepare_config(candidate, settings)
    except RuntimeError:
        pass
    else:
        raise AssertionError("An unsafe deployment target or storage change was accepted")
for candidate in [
    {"bindings": []},
    {"bindings": [{"type": "kv_namespace", "name": "TIKTOK_AUTH", "namespace_id": "invalid"}]},
    {"bindings": [settings["bindings"][0], settings["bindings"][0]]},
]:
    try:
        module.prepare_config(deepcopy(config), candidate)
    except RuntimeError:
        pass
    else:
        raise AssertionError("Missing or ambiguous live storage was accepted")
assert module.media_preflight_ok(403, b'{"error":"unauthorized_workflow"}')
assert not module.media_preflight_ok(200, b'{"error":"unauthorized_workflow"}')
assert not module.media_preflight_ok(403, b"Cloudflare access denied")
assert not module.media_preflight_ok(403, b'{"error":"another_error"}')
print("PASS: exact Worker/account, existing KV retention, no copied secrets and strict live authorization checks")
