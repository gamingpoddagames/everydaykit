// TikTok token lifecycle and secure GitHub Actions creator-info probe.
// A GitHub-hosted workflow proves identity with a short-lived OIDC JWT.
// No static bridge API key, Client Secret or refresh token leaves Cloudflare.
// This endpoint NEVER publishes a video.
const OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const OIDC_JWKS = OIDC_ISSUER + "/.well-known/jwks";
const API_ORIGIN = "https://everydaykit.gamingpoddagames.workers.dev/freesignal/api/tiktok/";
const OIDC_AUDIENCE = API_ORIGIN + "creator-check";
const POST_AUDIENCE = API_ORIGIN + "posting-token";
const DRAFT_AUDIENCE = API_ORIGIN + "draft-upload-token";
const REPO = "gamingpoddagames/AutoTradingSignals";
const REPO_ID = "1436107564";
const WORKFLOW = REPO + "/.github/workflows/freesignal-tiktok-sandbox-check.yml@refs/heads/main";
const POST_WORKFLOW = REPO + "/.github/workflows/freesignal-facebook-media.yml@refs/heads/main";
const DRAFT_WORKFLOW = REPO + "/.github/workflows/freesignal-tiktok-draft-upload-test.yml@refs/heads/main";
const KV_KEY = "owner-tiktok-authorization";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

function reply(object, status=200) {
  return new Response(JSON.stringify(object), {status, headers:{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff",
  }});
}
function decode64(s) {
  const normalized=s.replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,"="));
  return Uint8Array.from(raw, c=>c.charCodeAt(0));
}
function parseJson64(s){return JSON.parse(new TextDecoder().decode(decode64(s)));}
async function authorizedAction(request, purpose="probe") {
  const authorization=request.headers.get("Authorization")||"";
  if(!authorization.startsWith("Bearer "))return false;
  const token=authorization.slice(7);
  if(token.length>12000)return false;
  const parts=token.split(".");
  if(parts.length!==3)return false;
  let header, claims;
  try {header=parseJson64(parts[0]);claims=parseJson64(parts[1]);}catch{return false;}
  if(header.alg!=="RS256" || typeof header.kid!=="string" || header.kid.length>200)return false;
  const now=Math.floor(Date.now()/1000);
  const isPosting = purpose==="posting";
  const isDraft = purpose==="draft";
  const expectedAudience=isDraft?DRAFT_AUDIENCE:(isPosting?POST_AUDIENCE:OIDC_AUDIENCE);
  const expectedWorkflow=isDraft?DRAFT_WORKFLOW:(isPosting?POST_WORKFLOW:WORKFLOW);
  if(claims.iss!==OIDC_ISSUER || claims.aud!==expectedAudience ||
     claims.repository!==REPO || String(claims.repository_id)!==REPO_ID ||
     claims.ref!=="refs/heads/main" || claims.workflow_ref!==expectedWorkflow ||
     !(isDraft ? ["workflow_dispatch","push"].includes(claims.event_name) :
       isPosting ? ["schedule","workflow_dispatch"].includes(claims.event_name) :
       ["schedule","workflow_dispatch","push"].includes(claims.event_name)) ||
     typeof claims.exp!=="number" || claims.exp<=now ||
     claims.exp>now+900 || typeof claims.iat!=="number" ||
     claims.iat>now+60 || claims.iat<now-900 ||
     (typeof claims.nbf==="number" && claims.nbf>now+60)) return false;
  // Fetch from GitHub's OIDC issuer (not a URL supplied by the caller).
  let jwks;
  try {
    const res=await fetch(OIDC_JWKS,{headers:{"Accept":"application/json"}});
    if(!res.ok)return false;
    jwks=await res.json();
  }catch{return false;}
  const jwk=Array.isArray(jwks.keys)?jwks.keys.find(k=>k.kid===header.kid && k.kty==="RSA" && k.use==="sig" && k.alg==="RS256"):null;
  if(!jwk)return false;
  try {
    const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
    return crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,decode64(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
  }catch{return false;}
}
async function aes(secret) {
  const hashed=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw",hashed,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
function b64(data){let x="";for(const v of data)x+=String.fromCharCode(v);return btoa(x);}
async function decrypt(content,secret){
  const record=JSON.parse(content);
  if(record.version!==1)throw Error("unknown format");
  const plaintext=await crypto.subtle.decrypt({name:"AES-GCM",iv:decode64(record.iv)},await aes(secret),decode64(record.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
async function encrypt(data,secret){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const payload=new TextEncoder().encode(JSON.stringify(data));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},await aes(secret),payload));
  return JSON.stringify({version:1,iv:b64(iv),ciphertext:b64(ct)});
}
async function getCurrentToken(env){
  const encrypted=await env.TIKTOK_AUTH.get(KV_KEY);
  if(!encrypted)return {error:"not_authorized"};
  let stored;
  try{stored=await decrypt(encrypted,env.TIKTOK_ENCRYPTION_SECRET);}
  catch{return {error:"stored_token_unavailable"};}
  const now=Date.now();
  if(typeof stored.access_token!=="string" || typeof stored.refresh_token!=="string" ||
     typeof stored.open_id!=="string")return {error:"invalid_stored_token"};
  if(stored.expires_at>now+20*60*1000)return {token:stored.access_token,scope:stored.scope};
  if(stored.refresh_expires_at && stored.refresh_expires_at<=now+60000)return {error:"reconnect_required"};
  let response,data;
  try {
    response=await fetch(TOKEN_URL,{
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({
        client_key:env.TIKTOK_CLIENT_KEY,client_secret:env.TIKTOK_CLIENT_SECRET,
        grant_type:"refresh_token",refresh_token:stored.refresh_token,
      }).toString()
    });
    data=await response.json();
  }catch{return {error:"refresh_network_failed"};}
  if(!response.ok || data?.error || !data?.access_token || !data?.refresh_token ||
     (data?.open_id && data.open_id!==stored.open_id))return {error:"refresh_rejected"};
  const updated={
    access_token:data.access_token,refresh_token:data.refresh_token,
    open_id:stored.open_id,scope:data.scope||stored.scope,
    expires_at:now+Number(data.expires_in||0)*1000,
    refresh_expires_at:now+Number(data.refresh_expires_in||0)*1000,
    saved_at:new Date().toISOString(),
  };
  // Always persist rotated refresh token BEFORE using the new access token.
  try{await env.TIKTOK_AUTH.put(KV_KEY,await encrypt(updated,env.TIKTOK_ENCRYPTION_SECRET));}
  catch{return {error:"refresh_persistence_failed"};}
  return {token:updated.access_token,scope:updated.scope};
}
export async function handleTikTokCreatorCheck(request,env) {
  if(request.method!=="POST")return reply({ok:false,error:"method_not_allowed"},405);
  if(!(await authorizedAction(request)))return reply({ok:false,error:"unauthorized_workflow"},403);
  if(!env.TIKTOK_AUTH || !env.TIKTOK_ENCRYPTION_SECRET || !env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET)
    return reply({ok:false,error:"server_not_configured"},503);
  const current=await getCurrentToken(env);
  if(current.error)return reply({ok:false,error:current.error},503);
  let result;
  try {
    const response=await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/",{
      method:"POST",headers:{"Authorization":"Bearer "+current.token,"Content-Type":"application/json"},
      body:"{}"
    });
    result=await response.json();
    if(!response.ok || result?.error?.code!=="ok")
      return reply({ok:false,error:"creator_info_rejected",code:
        /^[a-zA-Z0-9_]{1,70}$/.test(result?.error?.code||"")?result.error.code:"unknown"},502);
  }catch{return reply({ok:false,error:"creator_info_network_failed"},502);}
  const creator=result?.data||{};
  // Return only profile info visible to the authorized creator, never tokens.
  return reply({ok:true,
    username_matches:String(creator.creator_username||"").replace(/^@/,"").toLowerCase()==="freesignaltradealerts",
    username_present:typeof creator.creator_username==="string",
    privacy_options:Array.isArray(creator.privacy_level_options)?creator.privacy_level_options:[],
    post_duration_limit:typeof creator.max_video_post_duration_sec==="number"?creator.max_video_post_duration_sec:null,
    public_posting_approved:false,
    note:"Creator-info test only. No video was uploaded or published."
  });
}

/**
 * Credential vending is disabled until TikTok public posting has been audited
 * and the owner explicitly sets Worker secret TIKTOK_PUBLIC_POST_APPROVED=true.
 * GitHub Actions must also set FREESIGNAL_TIKTOK_DIRECT_POST_APPROVED=true.
 * A signed, short-lived GitHub OIDC JWT specific to the expected workflow is
 * required to retrieve the access token; refresh tokens NEVER leave Cloudflare.
 */
export async function handleTikTokPostingToken(request,env) {
  if(request.method!=="POST")return reply({ok:false,error:"method_not_allowed"},405);
  if(!(await authorizedAction(request,"posting")))return reply({ok:false,error:"unauthorized_workflow"},403);
  if(env.TIKTOK_PUBLIC_POST_APPROVED!=="true")return reply({ok:false,error:"posting_not_approved"},403);
  if(!env.TIKTOK_AUTH || !env.TIKTOK_ENCRYPTION_SECRET || !env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET)
    return reply({ok:false,error:"server_not_configured"},503);
  const current=await getCurrentToken(env);
  if(current.error)return reply({ok:false,error:current.error},503);
  if(!String(current.scope||"").split(",").includes("video.publish"))
    return reply({ok:false,error:"video_publish_scope_not_authorized"},403);
  return reply({ok:true,access_token:current.token,expires_in_max_seconds:7200});
}

/**
 * Sandbox draft-only credential broker. This endpoint does not post or create
 * media on its own. Only the exact private test workflow on the owner repo can
 * access a scoped token, and only when video.upload is authorized.
 * This route is distinct from the audit-gated public Direct Post route.
 */
export async function handleTikTokDraftToken(request,env) {
  if(request.method!=="POST")return reply({ok:false,error:"method_not_allowed"},405);
  if(!(await authorizedAction(request,"draft")))return reply({ok:false,error:"unauthorized_workflow"},403);
  if(!env.TIKTOK_AUTH || !env.TIKTOK_ENCRYPTION_SECRET || !env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET)
    return reply({ok:false,error:"server_not_configured"},503);
  const current=await getCurrentToken(env);
  if(current.error)return reply({ok:false,error:current.error},503);
  if(!String(current.scope||"").split(",").map(x=>x.trim()).includes("video.upload"))
    return reply({ok:false,error:"video_upload_scope_missing_reauthorize"},403);
  return reply({ok:true,access_token:current.token});
}
