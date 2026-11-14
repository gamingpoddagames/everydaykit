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
  await env.TIKTOK_AUTH.put("oauth-state:"+state, "pending", {expirationTtl:600});
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
  const found = await env.TIKTOK_AUTH.get("oauth-state:"+state);
  if (found !== "pending") return fail("Login session expired or already used.",403);
  await env.TIKTOK_AUTH.delete("oauth-state:"+state);
  const body = new URLSearchParams({
    client_key:env.TIKTOK_CLIENT_KEY,client_secret:env.TIKTOK_CLIENT_SECRET,
    code,grant_type:"authorization_code",redirect_uri:REDIRECT,
  });
  let token;
  try {
    const response = await fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:body.toString(),redirect:"error"});
    if (!response.ok) return fail("TikTok token exchange was rejected. Confirm the correct Sandbox credentials and redirect URI.",502);
    token = await response.json();
  } catch (_) { return fail("TikTok token exchange temporarily unavailable.",502); }
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
