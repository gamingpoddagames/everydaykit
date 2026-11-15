import {authorizedAction} from "./tiktok_bridge.js";

const ORIGIN = "https://everydaykit.gamingpoddagames.workers.dev";
const MAX_BYTES = 10 * 1024 * 1024;
const PREFIX = "public-promo-video:";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HASH = /^[a-f0-9]{64}$/;

function json(value, status=200) {
  return new Response(JSON.stringify(value), {status, headers:{
    "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff",
  }});
}

export async function handlePromoMediaUpload(request, env) {
  if (request.method !== "POST") return json({ok:false,error:"method_not_allowed"},405);
  if (!(await authorizedAction(request,"buffer_media")))
    return json({ok:false,error:"unauthorized_workflow"},403);
  if (!env.TIKTOK_AUTH) return json({ok:false,error:"media_storage_unavailable"},503);
  const day=request.headers.get("X-FreeSignal-Date")||"";
  const hash=request.headers.get("X-Content-SHA256")||"";
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const length=Number(request.headers.get("Content-Length"));
  if (!DAY.test(day) || day!==today || !HASH.test(hash) ||
      !Number.isInteger(length) || length<10000 || length>MAX_BYTES ||
      request.headers.get("Content-Type")!=="video/mp4")
    return json({ok:false,error:"invalid_media_metadata"},400);
  const bytes=await request.arrayBuffer();
  const view=new Uint8Array(bytes);
  if (bytes.byteLength!==length || new TextDecoder().decode(view.slice(4,8))!=="ftyp")
    return json({ok:false,error:"invalid_mp4"},400);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  const actual=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
  if (actual!==hash) return json({ok:false,error:"media_hash_mismatch"},400);
  // This namespace is separate from encrypted authorization records. Only
  // original videos intended for public promotion are stored under this key.
  await env.TIKTOK_AUTH.put(PREFIX+day+":"+hash,bytes,{
    expirationTtl:30*24*60*60,
    metadata:{date:day,sha256:hash,size:length,createdAt:new Date().toISOString()},
  });
  return json({ok:true,url:ORIGIN+"/freesignal/api/public-video/"+day+"/"+hash+".mp4",sha256:hash,bytes:length});
}

export async function handlePublicPromoVideo(request, env) {
  if (!["GET","HEAD"].includes(request.method)) return json({ok:false,error:"method_not_allowed"},405);
  const match=new URL(request.url).pathname.match(/^\/freesignal\/api\/public-video\/(\d{4}-\d{2}-\d{2})\/([a-f0-9]{64})\.mp4$/);
  if (!match || !env.TIKTOK_AUTH) return json({ok:false,error:"not_found"},404);
  const [,day,hash]=match;
  const record=await env.TIKTOK_AUTH.getWithMetadata(PREFIX+day+":"+hash,{type:"arrayBuffer"});
  if (!record.value) return json({ok:false,error:"not_found"},404);
  const bytes=record.value;
  const headers={"Content-Type":"video/mp4","Content-Length":String(bytes.byteLength),
    "Content-Disposition":'inline; filename="freesignal_'+day+'.mp4"',
    "X-Content-Type-Options":"nosniff","Accept-Ranges":"bytes",
    "ETag":'"'+hash+'"',"Cache-Control":"public, max-age=86400, immutable"};
  if (request.headers.get("If-None-Match")===headers.ETag) return new Response(null,{status:304,headers});
  const range=request.headers.get("Range");
  if (range) {
    const parts=range.match(/^bytes=(\d*)-(\d*)$/);
    const suffix=parts&&!parts[1]&&parts[2]?Number(parts[2]):0;
    const start=suffix>0?Math.max(0,bytes.byteLength-suffix):parts&&parts[1]?Number(parts[1]):-1;
    const end=suffix>0?bytes.byteLength-1:parts&&parts[2]?Math.min(Number(parts[2]),bytes.byteLength-1):bytes.byteLength-1;
    if (!parts || start<0 || start>=bytes.byteLength || end<start || end>=bytes.byteLength)
      return new Response(null,{status:416,headers:{"Content-Range":"bytes */"+bytes.byteLength}});
    headers["Content-Range"]="bytes "+start+"-"+end+"/"+bytes.byteLength;
    headers["Content-Length"]=String(end-start+1);
    return new Response(request.method==="HEAD"?null:bytes.slice(start,end+1),{status:206,headers});
  }
  return new Response(request.method==="HEAD"?null:bytes,{status:200,headers});
}
