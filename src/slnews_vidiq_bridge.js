// Dedicated SL NEWS GitHub -> vidIQ publishing bridge.
// Existing TikTok/FreeSignal credentials and tokens are never read or changed.
const MCP = "https://mcp.vidiq.com/mcp";
const TOKEN = MCP + "/token";
const REGISTER = MCP + "/register";
const BASE = "https://everydaykit.gamingpoddagames.workers.dev/slnews247/vidiq";
const ACCOUNT = "_000pSUDUpUO5p3zoi4neSwWWUIyukn4lGIr";
const RECORD = "slnews247-vidiq-oauth-v1";
const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "slnews247-vidiq-publisher";
const REPOSITORY = "gamingpoddagames/-slnews247";
const OWNER_ID = "258440656";
const WORKFLOWS = new Set(["news.yml", "blogger-mirror.yml"]);
const ALLOWED = new Set(["vidiq_social_account_list", "vidiq_video_upload",
  "vidiq_upload_image", "vidiq_social_post_draft_create",
  "vidiq_social_post_draft_update", "vidiq_social_post_draft_get",
  "vidiq_social_post_publish", "vidiq_social_post_status", "vidiq_social_post_list"]);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const headers = {"Cache-Control":"no-store", "Referrer-Policy":"no-referrer",
  "X-Content-Type-Options":"nosniff",
  "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
function json(value, status=200, extra={}) {
  return new Response(JSON.stringify(value), {status, headers:{...headers, "Content-Type":"application/json", ...extra}});
}
function page(message, status=200, extra={}) {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  return new Response('<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SL NEWS 24/7 publishing connection</title><style>body{background:#0a1830;color:#fff;font:18px/1.6 system-ui;max-width:680px;margin:8vh auto;padding:24px}main{background:#ac1933;border:3px solid white;border-radius:24px;padding:28px}button{padding:14px 22px;background:#ffe44f;color:#15243a;border:0;border-radius:10px;font-weight:700}a{color:#ffe44f}</style><main><h1>SL NEWS 24/7</h1><p>'+esc(message)+'</p>'+(status===200&&message==="Connect the existing vidIQ account for direct Public news publishing from the existing GitHub news workflow."?'<form method="POST" action="/slnews247/vidiq/start"><button>Connect existing vidIQ account</button></form>':"")+'</main></html>',
    {status,headers:{...headers,"Content-Type":"text/html; charset=utf-8",...extra}});
}
function base64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function unbase64(s) { return Uint8Array.from(atob(s), c=>c.charCodeAt(0)); }
function url64(bytes) { return base64(bytes).replaceAll("+","-").replaceAll("/","_").replaceAll("=",""); }
function from64(s) { return unbase64(s.replaceAll("-","+").replaceAll("_","/")+"=".repeat((4-s.length%4)%4)); }
function random() { return url64(crypto.getRandomValues(new Uint8Array(32))); }
async function aes(secret) {
  if (typeof secret!=="string"||secret.length<32) throw Error("storage_not_configured");
  return crypto.subtle.importKey("raw",await crypto.subtle.digest("SHA-256",encoder.encode(secret)),{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
export async function seal(value, secret) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},await aes(secret),encoder.encode(JSON.stringify(value))));
  return JSON.stringify({v:1,iv:base64(iv),cipher:base64(cipher)});
}
export async function open(value, secret) {
  const d=JSON.parse(value);
  if(d.v!==1)throw Error("invalid_record");
  return JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:unbase64(d.iv)},await aes(secret),unbase64(d.cipher))));
}
function cookie(req,name) { return (req.headers.get("Cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="))?.slice(name.length+1)||""; }
function ready(env) { return !!(env.TIKTOK_AUTH?.get&&env.TIKTOK_AUTH?.put&&typeof env.TIKTOK_ENCRYPTION_SECRET==="string"&&env.TIKTOK_ENCRYPTION_SECRET.length>=32); }
export function decodeRPC(text) {
  const raw=text.trim();
  if(raw.startsWith("{"))return JSON.parse(raw);
  for(const line of raw.split("\n"))if(line.startsWith("data:")){
    try{const d=JSON.parse(line.slice(5).trim());if(d.result||d.error)return d;}catch{}
  }
  throw Error("invalid_mcp_response");
}
function data(result) {
  if(result?.structuredContent)return result.structuredContent;
  for(const c of result?.content||[])if(c.type==="text"){try{return JSON.parse(c.text);}catch{}}
  return result;
}
async function upstream(access,body,session="") {
  const h={"Authorization":"Bearer "+access,"Content-Type":"application/json",
    "Accept":"application/json, text/event-stream","MCP-Protocol-Version":"2025-06-18"};
  if(session)h["Mcp-Session-Id"]=session;
  const r=await fetch(MCP,{method:"POST",headers:h,body:JSON.stringify(body),signal:AbortSignal.timeout(55000)});
  if(r.status===202)return {response:null,session:r.headers.get("Mcp-Session-Id")||session};
  if(!r.ok)throw Error("mcp_http_"+r.status);
  const response=decodeRPC(await r.text());
  if(response.error)throw Error("mcp_request_failed");
  return {response,session:r.headers.get("Mcp-Session-Id")||session};
}
async function assertAccount(access) {
  const init=await upstream(access,{jsonrpc:"2.0",id:1,method:"initialize",params:{
    protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"SL NEWS 24/7 GitHub publisher",version:"1.0"}}});
  await upstream(access,{jsonrpc:"2.0",method:"notifications/initialized"},init.session);
  const result=await upstream(access,{jsonrpc:"2.0",id:2,method:"tools/call",
    params:{name:"vidiq_social_account_list",arguments:{platform:"TIKTOK"}}},init.session);
  const a=data(result.response.result).accounts||[];
  if(!a.some(x=>x.platformAccountId===ACCOUNT&&x.platform==="TIKTOK"&&x.canPublish===true))
    throw Error("wrong_or_unavailable_news_account");
}
export function checkClaims(c,now=Date.now()/1000) {
  const aud=Array.isArray(c.aud)?c.aud:[c.aud];
  if(c.iss!==ISSUER||!aud.includes(AUDIENCE)||c.repository!==REPOSITORY||
     String(c.repository_owner_id)!==OWNER_ID||c.ref!=="refs/heads/main"||
     !Number.isFinite(c.exp)||!Number.isFinite(c.iat)||c.exp<now-20||
     c.iat>now+20||c.exp-c.iat>1800)throw Error("github_identity_denied");
  if(![...WORKFLOWS].some(f=>c.workflow_ref===REPOSITORY+"/.github/workflows/"+f+"@refs/heads/main"))
    throw Error("github_workflow_denied");
  if(!["push","schedule","workflow_dispatch"].includes(c.event_name))throw Error("github_event_denied");
}
let jwksCache={until:0,keys:[]};
async function githubIdentity(req) {
  const value=(req.headers.get("Authorization")||"").replace(/^Bearer /,"");
  const parts=value.split(".");
  if(parts.length!==3)throw Error("github_identity_required");
  const head=JSON.parse(decoder.decode(from64(parts[0])));
  const claims=JSON.parse(decoder.decode(from64(parts[1])));
  if(head.alg!=="RS256"||typeof head.kid!=="string")throw Error("github_signature_denied");
  checkClaims(claims);
  if(jwksCache.until<Date.now()){
    const r=await fetch(ISSUER+"/.well-known/jwks",{signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Error("github_keys_unavailable");
    jwksCache={until:Date.now()+300000,keys:(await r.json()).keys||[]};
  }
  const jwk=jwksCache.keys.find(k=>k.kid===head.kid&&k.kty==="RSA");
  if(!jwk)throw Error("github_key_unknown");
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  if(!await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,from64(parts[2]),encoder.encode(parts[0]+"."+parts[1])))
    throw Error("github_signature_denied");
}
export function validateCall(body) {
  if(body.jsonrpc!=="2.0")throw Error("invalid_rpc");
  if(["initialize","notifications/initialized","tools/list"].includes(body.method))return;
  if(body.method!=="tools/call"||!ALLOWED.has(body.params?.name))throw Error("tool_not_allowed");
  const name=body.params.name,a=body.params.arguments||{};
  if(name==="vidiq_social_account_list"&&a.platform!=="TIKTOK")throw Error("wrong_platform");
  if(name==="vidiq_social_post_list"&&
     (JSON.stringify(a.platforms)!=='["TIKTOK"]'||JSON.stringify(a.platformAccountIds)!==JSON.stringify([ACCOUNT])))
    throw Error("wrong_platform");
  if(name==="vidiq_video_upload"&&(a.url||a.file))throw Error("local_upload_required");
  if(name==="vidiq_upload_image"&&a.image)throw Error("local_upload_required");
  if(name==="vidiq_social_post_draft_create"||name==="vidiq_social_post_draft_update"){
    if(a.publishAt)throw Error("scheduled_publication_not_allowed");
    for(const d of a.destinations||[]){
      if(d.platform!=="TIKTOK"||d.platformAccountId!==ACCOUNT||d.publishAt)
        throw Error("wrong_destination_or_time");
      if(d.privacyLevel&&d.privacyLevel!=="PUBLIC_TO_EVERYONE")throw Error("public_only");
      if(d.autoAddMusic===true)throw Error("additional_music_not_allowed");
    }
    if(name==="vidiq_social_post_draft_create"){
      const d=a.destinations;
      if(!Array.isArray(d)||d.length!==1||d[0].privacyLevel!=="PUBLIC_TO_EVERYONE"||
         d[0].allowComment!==true||d[0].autoAddMusic!==false||d[0].musicUsageConfirmed!==true)
        throw Error("approved_settings_required");
    }
  }
}
async function accessToken(env) {
  const raw=await env.TIKTOK_AUTH.get(RECORD);
  if(!raw)throw Error("connection_required");
  let saved=await open(raw,env.TIKTOK_ENCRYPTION_SECRET);
  if(saved.expires_at>Date.now()+120000)return saved.access_token;
  const r=await fetch(TOKEN,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({grant_type:"refresh_token",refresh_token:saved.refresh_token,
      client_id:saved.client_id,resource:MCP}).toString(),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error("connection_refresh_required");
  const d=await r.json();
  if(!d.access_token)throw Error("connection_refresh_required");
  saved={...saved,access_token:d.access_token,refresh_token:d.refresh_token||saved.refresh_token,
    expires_at:Date.now()+Number(d.expires_in||3600)*1000};
  await env.TIKTOK_AUTH.put(RECORD,await seal(saved,env.TIKTOK_ENCRYPTION_SECRET));
  return saved.access_token;
}
export async function handleNewsVidiq(req,env) {
  const url=new URL(req.url),path=url.pathname;
  if(path.endsWith("/connect")&&req.method==="GET")
    return page("Connect the existing vidIQ account for direct Public news publishing from the existing GitHub news workflow.");
  if(!ready(env))return json({error:"storage_not_configured"},503);
  if(path.endsWith("/start")&&req.method==="POST"){
    if(req.headers.get("Origin")!==url.origin)return page("Invalid connection request.",403);
    try{
      const reg=await fetch(REGISTER,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({client_name:"SL NEWS 24/7 GitHub Publisher",client_uri:"https://slnews247live.blogspot.com/",
          redirect_uris:[BASE+"/callback"],grant_types:["authorization_code","refresh_token"],
          response_types:["code"],token_endpoint_auth_method:"none"}),signal:AbortSignal.timeout(15000)});
      if(!reg.ok)throw Error("registration_failed");
      const client=await reg.json();
      if(!client.client_id)throw Error("registration_failed");
      const verifier=random(),state=random();
      const saved={client_id:client.client_id,verifier,state,expires:Date.now()+600000};
      const value=url64(encoder.encode(await seal(saved,env.TIKTOK_ENCRYPTION_SECRET)));
      const auth=new URL(MCP+"/authorize");
      for(const [k,v]of Object.entries({client_id:client.client_id,response_type:"code",scope:"api",
        redirect_uri:BASE+"/callback",state,code_challenge_method:"S256",
        code_challenge:url64(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(verifier)))),resource:MCP}))
        auth.searchParams.set(k,v);
      return new Response(null,{status:303,headers:{...headers,Location:auth.href,
        "Set-Cookie":"slnews_vidiq_state="+value+"; Max-Age=600; Path=/slnews247/vidiq/; Secure; HttpOnly; SameSite=Lax"}});
    }catch{return page("The publishing connection could not start. No account was changed.",502);}
  }
  if(path.endsWith("/callback")&&req.method==="GET"){
    try{
      if(url.searchParams.has("error"))throw Error("denied");
      const saved=await open(decoder.decode(from64(cookie(req,"slnews_vidiq_state"))),env.TIKTOK_ENCRYPTION_SECRET);
      if(saved.expires<Date.now()||saved.state!==url.searchParams.get("state")||!url.searchParams.get("code"))throw Error("state");
      const r=await fetch(TOKEN,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({grant_type:"authorization_code",client_id:saved.client_id,
          code:url.searchParams.get("code"),code_verifier:saved.verifier,redirect_uri:BASE+"/callback",resource:MCP}).toString(),
        signal:AbortSignal.timeout(20000)});
      if(!r.ok)throw Error("exchange");
      const t=await r.json();
      if(!t.access_token||!t.refresh_token)throw Error("incomplete");
      await assertAccount(t.access_token);
      await env.TIKTOK_AUTH.put(RECORD,await seal({client_id:saved.client_id,
        access_token:t.access_token,refresh_token:t.refresh_token,
        expires_at:Date.now()+Number(t.expires_in||3600)*1000,saved_at:new Date().toISOString()},env.TIKTOK_ENCRYPTION_SECRET));
      return page("The existing SL NEWS 24/7 TikTok account is connected for direct Public publishing from the GitHub news workflow. No video was posted during connection.",200,
        {"Set-Cookie":"slnews_vidiq_state=; Max-Age=0; Path=/slnews247/vidiq/; Secure; HttpOnly; SameSite=Lax"});
    }catch{return page("Connection was not saved. Use the vidIQ account that owns the already connected SL NEWS 24/7 TikTok profile, then start again.",403);}
  }
  if(path.endsWith("/status")&&req.method==="GET"){
    try{await githubIdentity(req);return json({connected:!!await env.TIKTOK_AUTH.get(RECORD),platform:"TIKTOK",account:ACCOUNT});}
    catch{return json({service:"SL NEWS 24/7 direct publisher",authorization:"private",github_oidc_required:true},401);}
  }
  if(path.endsWith("/mcp")&&req.method==="POST"){
    try{await githubIdentity(req);}catch{return json({error:"github_identity_denied"},403);}
    if(Number(req.headers.get("Content-Length"))>262144)return json({error:"request_too_large"},413);
    try{
      const text=await req.text();if(text.length>262144)return json({error:"request_too_large"},413);
      const body=JSON.parse(text);validateCall(body);
      const story=req.headers.get("X-SLNews-Story")||"";
      if(body.method==="tools/call"&&!/^[a-f0-9]{24}:(photo|reel)$/.test(story))
        return json({error:"story_identity_required"},400);
      const args=body.params?.arguments||{},name=body.params?.name;
      if(name?.startsWith("vidiq_social_post_")&&name!=="vidiq_social_post_list"&&name!=="vidiq_social_post_draft_create"){
        const owner=await env.TIKTOK_AUTH.get("slnews_vidiq_post:"+args.postId);
        if(owner!==story)return json({error:"post_identity_denied"},403);
      }
      const result=await upstream(await accessToken(env),body,req.headers.get("Mcp-Session-Id")||"");
      if(name==="vidiq_social_post_draft_create"){
        const d=data(result.response?.result);
        if(d?.postId)await env.TIKTOK_AUTH.put("slnews_vidiq_post:"+d.postId,story);
      }
      return json(result.response||{},200,result.session?{"Mcp-Session-Id":result.session}:{});
    }catch(e){
      const allowed=new Set(["connection_required","connection_refresh_required","scheduled_publication_not_allowed",
        "wrong_destination_or_time","public_only","additional_music_not_allowed","approved_settings_required",
        "tool_not_allowed","local_upload_required","wrong_platform"]);
      return json({error:allowed.has(e.message)?e.message:"publishing_bridge_error"},503);
    }
  }
  return json({error:"not_found"},404);
}
