import test from "node:test";
import assert from "node:assert/strict";
import {seal, open, decodeRPC, checkClaims, validateCall, handleNewsVidiq} from "../src/slnews_vidiq_bridge.js";
const ACCOUNT="_000pSUDUpUO5p3zoi4neSwWWUIyukn4lGIr";
const claims=()=>({iss:"https://token.actions.githubusercontent.com",aud:"slnews247-vidiq-publisher",
  repository:"gamingpoddagames/-slnews247",repository_owner_id:"258440656",ref:"refs/heads/main",
  workflow_ref:"gamingpoddagames/-slnews247/.github/workflows/news.yml@refs/heads/main",
  event_name:"push",iat:1000,exp:1300});
const call=(name,args)=>({jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:args}});
const settings=()=>({platform:"TIKTOK",platformAccountId:ACCOUNT,privacyLevel:"PUBLIC_TO_EVERYONE",
  allowComment:true,autoAddMusic:false,musicUsageConfirmed:true});
test("encrypted tokens roundtrip and are not stored in plaintext",async()=>{
  const s=await seal({refresh_token:"private-test-value",text:"සිංහල"},"a".repeat(64));
  assert.equal(s.includes("private-test-value"),false);
  assert.deepEqual(await open(s,"a".repeat(64)),{refresh_token:"private-test-value",text:"සිංහල"});
  await assert.rejects(open(s,"b".repeat(64)));
});
test("MCP JSON and SSE responses decode without losing structured evidence",()=>{
  assert.equal(decodeRPC('{"result":{"ready":true}}').result.ready,true);
  assert.equal(decodeRPC('event: message\ndata: {"id":1,"result":{"ready":true}}\n\n').result.ready,true);
  assert.throws(()=>decodeRPC("not JSON"));
});
test("only the owner's main production workflows may call the bridge",()=>{
  checkClaims(claims(),1100);
  const b=claims();b.workflow_ref=b.workflow_ref.replace("news.yml","blogger-mirror.yml");checkClaims(b,1100);
  for(const change of [{repository:"attacker/fork"},{repository_owner_id:"1"},{ref:"refs/heads/dev"},
    {aud:"wrong"},{iss:"https://evil.example"},{event_name:"pull_request"},
    {workflow_ref:"gamingpoddagames/-slnews247/.github/workflows/unknown.yml@refs/heads/main"},
    {exp:1001},{iat:1200},{iat:0,exp:4000}]){
    assert.throws(()=>checkClaims({...claims(),...change},1100),JSON.stringify(change));
  }
});
test("only the same TikTok account with the approved public options is accepted",()=>{
  validateCall(call("vidiq_social_post_draft_create",{destinations:[settings()]}));
  for(const change of [{platformAccountId:"wrong"},{platform:"YOUTUBE"},{privacyLevel:"SELF_ONLY"},
    {allowComment:false},{autoAddMusic:true},{musicUsageConfirmed:false}]){
    assert.throws(()=>validateCall(call("vidiq_social_post_draft_create",{destinations:[{...settings(),...change}]})));
  }
  assert.throws(()=>validateCall(call("vidiq_social_post_draft_create",{destinations:[]})));
});
test("the bridge cannot schedule posts, add other platforms, or run other tools",()=>{
  assert.throws(()=>validateCall(call("vidiq_social_post_draft_create",{destinations:[settings()],publishAt:"2027-01-01"})));
  assert.throws(()=>validateCall(call("vidiq_social_post_draft_update",{destinations:[{...settings(),publishAt:"2027-01-01"}]})));
  assert.throws(()=>validateCall(call("vidiq_update_video",{})));
  assert.throws(()=>validateCall(call("vidiq_social_account_list",{platform:"FACEBOOK_PAGES"})));
  assert.throws(()=>validateCall(call("vidiq_social_post_list",{platforms:["TIKTOK"],platformAccountIds:["wrong"]})));
  validateCall(call("vidiq_social_post_list",{platforms:["TIKTOK"],platformAccountIds:[ACCOUNT]}));
});
test("imports require the workflow's own local original media",()=>{
  assert.throws(()=>validateCall(call("vidiq_video_upload",{url:"https://youtube.com/watch?v=other"})));
  assert.throws(()=>validateCall(call("vidiq_upload_image",{image:"https://publisher.example/image.jpg"})));
  validateCall(call("vidiq_video_upload",{localFile:{path:"/tmp/own.mp4",sizeBytes:100}}));
  validateCall(call("vidiq_upload_image",{fileName:"news.jpg"}));
});
test("unauthenticated callers cannot publish or see the authorization state",async()=>{
  const env={TIKTOK_AUTH:{get:async()=>null,put:async()=>{}},TIKTOK_ENCRYPTION_SECRET:"a".repeat(64)};
  const r=await handleNewsVidiq(new Request("https://example.com/slnews247/vidiq/mcp",{method:"POST",body:"{}"}),env);
  assert.equal(r.status,403);
  const s=await handleNewsVidiq(new Request("https://example.com/slnews247/vidiq/status"),env);
  assert.equal(s.status,401);
  assert.equal((await s.json()).authorization,"private");
});
test("OAuth start rejects a cross-origin form",async()=>{
  const env={TIKTOK_AUTH:{get:async()=>null,put:async()=>{}},TIKTOK_ENCRYPTION_SECRET:"a".repeat(64)};
  const r=await handleNewsVidiq(new Request("https://example.com/slnews247/vidiq/start",{
    method:"POST",headers:{Origin:"https://evil.example"}}),env);
  assert.equal(r.status,403);
});
test("the connection form describes only the intended news use",async()=>{
  const r=await handleNewsVidiq(new Request("https://example.com/slnews247/vidiq/connect"),{});
  const text=await r.text();
  assert.ok(text.includes("SL NEWS 24/7"));
  assert.ok(text.includes("direct Public"));
  assert.ok(!text.includes("refresh_token"));
});
