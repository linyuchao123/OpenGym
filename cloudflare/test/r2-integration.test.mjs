import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {softPasskey} from './soft-passkey.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),origin='http://localhost:13113';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const fixture=fs.readFileSync(new URL('../../api/test/fixtures/lifestyle-apple.jpg',import.meta.url));
// Original helper defaults to 13110; registration accepts explicit origin, assertions below
// replace the serialized clientDataJSON through a helper bound to this process's origin.
process.env.CF_TEST_ORIGIN=origin;
test('Cloudflare native runtime: private fitness app on local D1 and R2',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gym-cf-test-'));
 const wrangler=path.join(root,'node_modules/wrangler/bin/wrangler.js');
 // Keep the runtime fixture small; the full 13k-file package is checked by preflight.
 const assets=path.join(dir,'assets');fs.mkdirSync(path.join(assets,'exercise-media/clip'),{recursive:true});
 fs.copyFileSync(path.resolve(root,'../frontend/dist/index.html'),path.join(assets,'index.html'));
 fs.copyFileSync(path.resolve(root,'../catalogue/media/clip/10818.mp4'),path.join(assets,'exercise-media/clip/10818.mp4'));
 const config=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8'));delete config.routes;delete config.triggers;config.r2_buckets=[{binding:'MEDIA',bucket_name:'local-media'}];config.vars.MEDIA_STORE='r2';config.main=path.join(root,'src/worker.js');config.assets.directory=assets;config.d1_databases[0].migrations_dir=path.join(root,'migrations');config.vars={...config.vars,ORIGIN:origin,RP_ID:'localhost',BOOTSTRAP_CODE:'LOCAL-QA-ONLY'};const configFile=path.join(dir,'wrangler.json');fs.writeFileSync(configFile,JSON.stringify(config));
 const env={...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'};
 const migrate=spawnSync(process.execPath,[wrangler,'--config',configFile,'d1','migrations','apply','DB','--local','--persist-to',dir],{cwd:root,env,encoding:'utf8',timeout:60000});assert.equal(migrate.status,0,migrate.stderr);
 const child=spawn(process.execPath,[wrangler,'--config',configFile,'dev','--local','--persist-to',dir,'--port','13113','--var','ORIGIN:'+origin,'--var','RP_ID:localhost','--var','BOOTSTRAP_CODE:LOCAL-QA-ONLY','--show-interactive-dev-session=false'],{cwd:root,env,stdio:['ignore','pipe','pipe'],detached:true});let logs='';child.stdout.on('data',b=>{logs+=b});child.stderr.on('data',b=>{logs+=b});
 t.after(()=>{try{process.kill(-child.pid,'SIGTERM')}catch{};fs.rmSync(dir,{recursive:true,force:true})});
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/health')).ok){ready=true;break}}catch{}await delay(300)}assert.ok(ready,logs);
 const request=async(method,url,body,cookie='')=>{
  const raw=body instanceof Uint8Array;
  const res=await fetch(origin+url,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':raw?'image/jpeg':'application/json'}:{})},...(body?{body:raw?body:JSON.stringify(body)}:{})});
  const text=await res.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:res.status,data,headers:res.headers,cookie:res.headers.get('set-cookie')?.split(';')[0]};
 };
 const signup=async(name,code)=>{const key=softPasskey(),opt=await request('POST','/api/register/options',{name,code});assert.equal(opt.status,200,JSON.stringify(opt.data)+' '+logs.slice(-1200));const r=await request('POST','/api/register/verify',{cid:opt.data.cid,credential:key.attestation(opt.data.options.challenge,{origin})});assert.equal(r.status,200,JSON.stringify(r.data));return {...r,key};};

 const alice=await signup('R2测试管理员','LOCAL-QA-ONLY'),invite=await request('POST','/api/admin/invites/new',{},alice.cookie),bob=await signup('R2测试伙伴',invite.data.invite.code);
 const hash=b=>createHash('sha256').update(b).digest('hex'),P=5*1024*1024,size=200*1024*1024;
 const first=Buffer.alloc(P),rest=Buffer.alloc(P);first.set([0,0,0,24,102,116,121,112]);const hashes=[hash(first),...Array(39).fill(hash(rest))];
 const body={mime:'video/mp4',size,hashes,name:'200MB-transport-test.mp4',fingerprint:hash(`video/mp4:${size}:${hashes.join(',')}`)};
 let id;
 const put=async(n,b)=>{const r=await fetch(origin+`/api/uploads/${id}/parts/${n}`,{method:'PUT',headers:{Origin:origin,Cookie:alice.cookie,'Content-Type':'application/octet-stream'},body:b});assert.equal(r.status,200,await r.text());};
 await t.test('configuration, authorization and exact 200 MiB boundary',async()=>{
  const cfg=(await request('GET','/api/config')).data;assert.equal(cfg.communityMedia.videoMB,200);assert.equal(cfg.hosting,'cloudflare-r2');
  assert.equal((await request('POST','/api/uploads/init',body)).status,401);
  assert.equal((await request('POST','/api/uploads/init',{...body,size:size+1},alice.cookie)).status,413);
  const s=await request('POST','/api/uploads/init',body,alice.cookie);assert.equal(s.status,201,JSON.stringify(s.data));id=s.data.id;
  assert.equal((await request('GET','/api/uploads/'+id,null,bob.cookie)).status,404);
  assert.equal((await request('GET','/api/uploads/usage',null,alice.cookie)).data.reservedBytes,size);
 });
 await t.test('forty chunks upload 200 MiB with resumable and duplicate-safe parts',async()=>{
  await put(1,first);await put(1,first);const resumed=await request('POST','/api/uploads/init',body,alice.cookie);assert.equal(resumed.data.id,id);assert.equal(resumed.data.uploadedParts.length,1);
  const bad=await fetch(origin+`/api/uploads/${id}/parts/2`,{method:'PUT',headers:{Origin:origin,Cookie:alice.cookie},body:first});assert.equal(bad.status,400);
  for(let n=2;n<=40;n++)await put(n,rest);
  const done=await request('POST',`/api/uploads/${id}/complete`,{},alice.cookie);assert.equal(done.status,200,JSON.stringify(done.data)+' '+logs.slice(-1000));assert.equal(done.data.size,size);
  assert.equal((await request('POST',`/api/uploads/${id}/complete`,{},alice.cookie)).data.id,id);
 });
 await t.test('large video Range streams preserve private and shared visibility',async()=>{
  assert.equal((await fetch(origin+'/api/life/asset?id='+id)).status,401);
  assert.equal((await request('GET','/api/life/asset?id='+id,null,bob.cookie)).status,404);
  const r=await fetch(origin+'/api/life/asset?id='+id,{headers:{Cookie:alice.cookie,Range:'bytes=0-15'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),`bytes 0-15/${size}`);assert.deepEqual(Buffer.from(await r.arrayBuffer()),first.subarray(0,16));
  const head=await fetch(origin+'/api/life/asset?id='+id,{method:'HEAD',headers:{Cookie:alice.cookie}});assert.equal(head.headers.get('content-length'),String(size));
  const post=await request('POST','/api/life/post',{text:'仅限本地测试',media:[id]},alice.cookie);assert.equal(post.status,200,JSON.stringify(post.data));
  const shared=await fetch(origin+'/api/life/asset?id='+id,{headers:{Cookie:bob.cookie,Range:'bytes=-2'}});assert.equal(shared.status,206);assert.equal((await shared.arrayBuffer()).byteLength,2);
  const usage=(await request('GET','/api/uploads/usage',null,alice.cookie)).data;assert.equal(usage.bytes,size);assert.equal(usage.reservedBytes,0);
  await request('POST','/api/life/react',{id:post.data.post.id,action:'delete'},alice.cookie);assert.equal((await request('GET','/api/life/asset?id='+id,null,bob.cookie)).status,404);
 });
 await t.test('playable clip round trip and legacy D1 photos stay compatible',async()=>{
  const b=fs.readFileSync(new URL('../../api/test/fixtures/lifestyle-video.mp4',import.meta.url)),hashes=[hash(b)],input={mime:'video/mp4',size:b.length,hashes,fingerprint:hash(`video/mp4:${b.length}:${hashes.join(',')}`)};
  const session=await request('POST','/api/uploads/init',input,alice.cookie);id=session.data.id;await put(1,b);assert.equal((await request('POST',`/api/uploads/${id}/complete`,{},alice.cookie)).status,200);
  const r=await fetch(origin+'/api/life/asset?id='+id,{headers:{Cookie:alice.cookie}});assert.deepEqual(Buffer.from(await r.arrayBuffer()),b);
  const old=await request('POST','/api/life/upload',new Uint8Array(fixture),alice.cookie);assert.equal(old.status,200);assert.equal((await fetch(origin+'/api/life/asset?id='+old.data.id,{headers:{Cookie:alice.cookie,Range:'bytes=0-1'}})).status,206);
  const shown=await request('POST','/api/life/post',{text:'poster visibility test',media:[id],poster:old.data.id},alice.cookie);assert.equal(shown.status,200,JSON.stringify(shown.data));assert.equal(shown.data.post.poster,old.data.id);assert.equal((await fetch(origin+'/api/life/asset?id='+old.data.id,{headers:{Cookie:bob.cookie,Range:'bytes=0-1'}})).status,206);
  await request('POST','/api/life/react',{id:shown.data.post.id,action:'delete'},alice.cookie);assert.equal((await fetch(origin+'/api/life/asset?id='+old.data.id,{headers:{Cookie:bob.cookie}})).status,404);
 });
});
