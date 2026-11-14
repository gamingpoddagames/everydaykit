// FreeSignal TikTok Login Kit — secure Cloudflare Worker OAuth callback.
// Existing static assets are served unchanged by the ASSETS binding.
// No OAuth token, code or client secret appears in any browser response.
const ORIGIN = "https://everydaykit.gamingpoddagames.workers.dev";
const REDIRECT = ORIGIN + "/freesignal/auth/callback";
const SCOPES = "user.info.basic,video.publish";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

function secureHeaders(extra = {}) {
  return {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    ...extra,
  };
}
function page(message, status = 200) {
  const escape = (s) => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FreeSignal TikTok Connection</title><style>body{background:#071321;color:#e5edf1;font:17px/1.6 system-ui;max-width:650px;margin:12vh auto;padding:20px}a{color:#65e9ae}main{border:1px solid #31545c;background:#122734;border-radius:16px;padding:26px}</style><main><h1>FreeSignal Video Publisher</h1><p>${escape(message)}</p><p><a href="/freesignal/">Return to website</a></p></main></html>`, {
    status, headers: secureHeaders({"Content-Type":"text/html; charset=utf-8"}),
  });
}
function fail(message, status = 400) { return page(message, status); }
function bytesRandom(length) {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return [...buf].map(n => n.toString(16).padStart(2, "0")).join("");
}
function equalSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || a.length < 32) return false;
  let xor = 0;
  for (let i = 0; i < a.length; i++) xor |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return xor === 0;
}
async function aesKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) throw Error("Missing encryption secret");
  const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", keyBytes, {name:"AES-GCM"}, false, ["encrypt", "decrypt"]);
}
function b64(bytes) {
  let s = ""; for (let x of bytes) s += String.fromCharCode(x);
  return btoa(s);
}
async function encrypt(data, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt(
    {name:"AES-GCM",iv}, await aesKey(secret), new TextEncoder().encode(JSON.stringify(data))));
  return JSON.stringify({version:1,iv:b64(iv),ciphertext:b64(cipher)});
}
function clientKeyDiagnostics(env) {
  const key = env.TIKTOK_CLIENT_KEY;
  if (typeof key !== "string" || !key) return { plausible: false, possible_app_id: false, has_whitespace_or_quotes: false };
  const trimmed = key.trim();
  return {
    plausible: /^[a-zA-Z0-9_-]{10,100}$/.test(key) && !/^\d{15,}$/.test(key),
    possible_app_id: /^\d{15,}$/.test(trimmed),
    has_whitespace_or_quotes: trimmed !== key || /["'\s]/.test(key),
    length_band: key.length < 10 ? "under_10" : key.length <= 32 ? "10_to_32" : key.length <= 100 ? "33_to_100" : "over_100",
    has_non_ascii_characters: /[^\x20-\x7e]/.test(key),
    has_non_alphanumeric_symbols: /[^a-zA-Z0-9_-]/.test(key),
  };
}
function configured(env) {
  return typeof env.TIKTOK_CLIENT_KEY === "string" && !!env.TIKTOK_CLIENT_KEY &&
    typeof env.TIKTOK_CLIENT_SECRET === "string" && !!env.TIKTOK_CLIENT_SECRET &&
    typeof env.FREESIGNAL_OAUTH_ADMIN_KEY === "string" && env.FREESIGNAL_OAUTH_ADMIN_KEY.length >= 32 &&
    typeof env.TIKTOK_ENCRYPTION_SECRET === "string" && env.TIKTOK_ENCRYPTION_SECRET.length >= 32 &&
    !!env.TIKTOK_AUTH && typeof env.TIKTOK_AUTH.put === "function";
}
function cookieValue(request, name) {
  const all = request.headers.get("Cookie") || "";
  const item = all.split(";").map(v=>v.trim()).find(v => v.startsWith(name + "="));
  return item?.slice(name.length+1) || "";
}
async function handleStart(request, env) {
  if (!configured(env)) return fail("TikTok server connection is not configured yet. Add the required Cloudflare secrets.", 503);
  if (request.method !== "POST") return fail("Use the private Connect TikTok form.", 405);
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("application/x-www-form-urlencoded")) return fail("Invalid form request",415);
  if (Number(request.headers.get("content-length")) > 8192) return fail("Request too large",413);
  const form = await request.formData();
  if (!equalSecret(form.get("admin_key"), env.FREESIGNAL_OAUTH_ADMIN_KEY)) return fail("Invalid owner authorization",403);
  const state = bytesRandom(24);
  // State is bound to a Secure, HttpOnly, SameSite=Lax browser cookie.
  // Cloudflare KV is eventually consistent across regions and cannot reliably
  // provide immediate read-after-write for the OAuth redirect roundtrip.
  const auth = new URL("https://www.tiktok.com/v2/auth/authorize/");
  auth.searchParams.set("client_key",env.TIKTOK_CLIENT_KEY);
  auth.searchParams.set("response_type","code");
  auth.searchParams.set("scope",SCOPES);
  auth.searchParams.set("redirect_uri",REDIRECT);
  auth.searchParams.set("state",state);
  return new Response(null,{status:303,headers:secureHeaders({
    Location:auth.href,
    "Set-Cookie":`fs_oauth_state=${state}; Max-Age=600; Path=/freesignal/auth/; Secure; HttpOnly; SameSite=Lax`,
  })});
}
async function handleCallback(request, env) {
  if (!configured(env)) return fail("TikTok callback not configured yet.",503);
  const url = new URL(request.url);
  if (url.searchParams.has("error")) return fail("TikTok authorization was cancelled or denied.");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = cookieValue(request,"fs_oauth_state");
  if (!code || code.length > 1000 || !state || !/^([a-f0-9]{48})$/.test(state) || !equalSecret(saved,state)) {
    return fail("The connection expired or its security check failed. Start again.",403);
  }
  // The matching random session cookie is the CSRF binding. TikTok authorization
  // codes are one-time-use; do not depend on cross-region KV state propagation.
  const body = new URLSearchParams({
    client_key:env.TIKTOK_CLIENT_KEY,client_secret:env.TIKTOK_CLIENT_SECRET,
    code,grant_type:"authorization_code",redirect_uri:REDIRECT,
  });
  let token;
  let tokenResponse;
  try {
    tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
      body: body.toString(),
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    // Do not display/log the full error; some runtimes include sensitive
    // request URLs or request details in their exception messages.
    const kind = e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : "network_error";
    return fail("TikTok token endpoint connection failed (" + kind + "). Start a new login attempt. If repeated, investigate Cloudflare outbound API connectivity.", 502);
  }
  try {
    token = await tokenResponse.json();
  } catch (_) {
    return fail("TikTok token endpoint returned a non-JSON response (HTTP " + tokenResponse.status + "). Start a new login attempt.", 502);
  }
  if (!tokenResponse.ok || token?.error) {
    // TikTok OAuth errors include short machine-readable categories and log_id.
    // Do not relay arbitrary descriptions that may include user data.
    const allowedErrors = new Set([
      "invalid_client", "invalid_grant", "invalid_request", "invalid_scope",
      "unauthorized_client", "unsupported_grant_type", "server_error",
      "temporarily_unavailable", "access_denied",
    ]);
    const category = allowedErrors.has(token?.error) ? token.error : "unknown_error";
    return fail("TikTok rejected the token exchange: " + category +
      " (HTTP " + tokenResponse.status + "). " +
      (category === "invalid_client" ? "Confirm that Client Key and Client Secret belong to the same Sandbox app." :
       category === "invalid_grant" ? "Start a new authorization; the code may have expired, been reused or mismatched." :
       "Try a new authorization session or check TikTok app settings."), 502);
  }
  if (!token?.access_token || !token?.refresh_token || !token?.open_id) return fail("TikTok did not provide a usable user authorization.",502);
  const granted = String(token.scope||"").split(",").map(v=>v.trim());
  if (!granted.includes("video.publish")) return fail("TikTok did not grant the requested video.publish scope.",403);
  const record = {
    access_token:token.access_token,refresh_token:token.refresh_token,open_id:token.open_id,
    scope:token.scope,expires_at:Date.now()+Number(token.expires_in||0)*1000,
    refresh_expires_at:Date.now()+Number(token.refresh_expires_in||0)*1000,
    saved_at:new Date().toISOString(),
  };
  await env.TIKTOK_AUTH.put("owner-tiktok-authorization", await encrypt(record,env.TIKTOK_ENCRYPTION_SECRET));
  const response = page("TikTok account authorization was stored securely on the server. This does not mean public Direct Posting has been approved.");
  response.headers.append("Set-Cookie","fs_oauth_state=; Max-Age=0; Path=/freesignal/auth/; Secure; HttpOnly; SameSite=Lax");
  return response;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/freesignal/auth/status") {
      if (request.method !== "GET") return fail("Method not allowed",405);
      return new Response(JSON.stringify({
        service: "FreeSignal TikTok Sandbox OAuth",
        worker: "active",
        configured: configured(env),
        client_key_format: clientKeyDiagnostics(env),
        client_key_format_note: "This is a heuristic only; TikTok does not document a required key pattern. A false result does not establish invalid credentials.",
        checks: {
          client_credentials: typeof env.TIKTOK_CLIENT_KEY === "string" && env.TIKTOK_CLIENT_KEY.length > 0 &&
            typeof env.TIKTOK_CLIENT_SECRET === "string" && env.TIKTOK_CLIENT_SECRET.length > 0,
          admin_key_valid: typeof env.FREESIGNAL_OAUTH_ADMIN_KEY === "string" &&
            env.FREESIGNAL_OAUTH_ADMIN_KEY.length >= 32,
          encryption_key_valid: typeof env.TIKTOK_ENCRYPTION_SECRET === "string" &&
            env.TIKTOK_ENCRYPTION_SECRET.length >= 32,
          kv_storage: !!env.TIKTOK_AUTH && typeof env.TIKTOK_AUTH.put === "function",
        },
        // Return only readiness booleans, never secret names, values, key lengths, tokens or KV contents.
        account_authorized: "not_publicly_disclosed",
      }), {status:200,headers:secureHeaders({"Content-Type":"application/json; charset=utf-8"})});
    }
    if (url.pathname === "/freesignal/auth/start") return handleStart(request,env);
    if (url.pathname === "/freesignal/auth/callback") {
      if (request.method !== "GET") return fail("Method not allowed",405);
      return handleCallback(request,env);
    }
    if (url.pathname.startsWith("/freesignal/auth/")) return fail("Route not found",404);
    return env.ASSETS.fetch(request);
  },
};
