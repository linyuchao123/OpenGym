import {test} from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {softPasskey} from './soft-passkey.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),origin='http://localhost:13112';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const fixture=fs.readFileSync(new URL('../../api/test/fixtures/lifestyle-apple.jpg',import.meta.url));
// Original helper defaults to 13110; registration accepts explicit origin, assertions below
// replace the serialized clientDataJSON through a helper bound to this process's origin.
process.env.CF_TEST_ORIGIN=origin;
test('Cloudflare native runtime: private fitness app on local D1',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gym-cf-test-'));
 let modelPayload;const model=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);modelPayload=JSON.parse(Buffer.concat(chunks));if(typeof modelPayload.messages[1].content==='string'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({layout:'editorial',palette:'green',headline:'认真记录慢慢进步'})}}]}))}const q=JSON.parse(modelPayload.messages[1].content[0].text);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({direction:'recomp',summary:'渐进训练，BMI只作参考',guidance:'从轻重量开始',sessions:q.intake.days.map(day=>({day,name:'全身训练',exercises:[{id:'0662',sets:2,reps:10,restSec:60},{id:'1197',sets:2,reps:10,restSec:60}]}))})}}]}))});await new Promise(r=>model.listen(0,'127.0.0.1',r));t.after(()=>model.close());
 const wrangler=path.join(root,'node_modules/wrangler/bin/wrangler.js');
 // Keep the runtime fixture small; the full 13k-file package is checked by preflight.
 const assets=path.join(dir,'assets');fs.mkdirSync(path.join(assets,'exercise-media/clip'),{recursive:true});
 fs.copyFileSync(path.resolve(root,'../frontend/dist/index.html'),path.join(assets,'index.html'));
 fs.copyFileSync(path.resolve(root,'../catalogue/media/clip/10818.mp4'),path.join(assets,'exercise-media/clip/10818.mp4'));
 const config=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8'));delete config.routes;delete config.r2_buckets;delete config.triggers;config.vars.MEDIA_STORE='d1';config.main=path.join(root,'src/worker.js');config.assets.directory=assets;config.d1_databases[0].migrations_dir=path.join(root,'migrations');config.vars={...config.vars,ORIGIN:origin,RP_ID:'localhost',BOOTSTRAP_CODE:'LOCAL-QA-ONLY',FOOD_AI_API_KEY:'local-ai-only',FOOD_AI_BASE_URL:'http://127.0.0.1:'+model.address().port};const configFile=path.join(dir,'wrangler.json');fs.writeFileSync(configFile,JSON.stringify(config));
 const env={...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'};
 const migrate=spawnSync(process.execPath,[wrangler,'--config',configFile,'d1','migrations','apply','DB','--local','--persist-to',dir],{cwd:root,env,encoding:'utf8',timeout:60000});assert.equal(migrate.status,0,migrate.stderr);
 const child=spawn(process.execPath,[wrangler,'--config',configFile,'dev','--local','--persist-to',dir,'--port','13112','--var','ORIGIN:'+origin,'--var','RP_ID:localhost','--var','BOOTSTRAP_CODE:LOCAL-QA-ONLY','--show-interactive-dev-session=false'],{cwd:root,env,stdio:['ignore','pipe','pipe'],detached:true});let logs='';child.stdout.on('data',b=>{logs+=b});child.stderr.on('data',b=>{logs+=b});
 t.after(()=>{try{process.kill(-child.pid,'SIGTERM')}catch{};fs.rmSync(dir,{recursive:true,force:true})});
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/health')).ok){ready=true;break}}catch{}await delay(300)}assert.ok(ready,logs);
 const request=async(method,url,body,cookie='')=>{
  const raw=body instanceof Uint8Array;
  const res=await fetch(origin+url,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':raw?'image/jpeg':'application/json'}:{})},...(body?{body:raw?body:JSON.stringify(body)}:{})});
  const text=await res.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:res.status,data,headers:res.headers,cookie:res.headers.get('set-cookie')?.split(';')[0]};
 };
 const signup=async(name,code)=>{const key=softPasskey(),opt=await request('POST','/api/register/options',{name,code});assert.equal(opt.status,200,JSON.stringify(opt.data)+' '+logs.slice(-1200));const r=await request('POST','/api/register/verify',{cid:opt.data.cid,credential:key.attestation(opt.data.options.challenge,{origin})});assert.equal(r.status,200,JSON.stringify(r.data));return {...r,key};};
 let alice,bob;
 await t.test('public exercise clips support Safari byte probes before login or service worker',async()=>{
  const source=fs.readFileSync(new URL('../../catalogue/media/clip/10818.mp4',import.meta.url));
  const probe=await fetch(origin+'/exercise-media/clip/10818.mp4',{headers:{Range:'bytes=0-1'}});
  assert.equal(probe.status,206);assert.equal(probe.headers.get('content-type'),'video/mp4');
  assert.equal(probe.headers.get('content-range'),`bytes 0-1/${source.length}`);
  assert.deepEqual(new Uint8Array(await probe.arrayBuffer()),new Uint8Array(source.subarray(0,2)));
  assert.equal((await fetch(origin+'/exercise-media/clip/99999.mp4')).status,404);
 });
 await t.test('no public signup, CSRF rejection and no paid services',async()=>{
  assert.equal((await request('POST','/api/register/options',{name:'intruder',code:'WRONG'})).status,403);
  const csrf=await fetch(origin+'/api/login/options',{method:'POST',headers:{Origin:'https://evil.test'}});assert.equal(csrf.status,403);
  const config=await request('GET','/api/config');assert.equal(config.data.hosting,'cloudflare-free');assert.equal(config.data.password_login,true);assert.equal(config.data.media.quotaMB,20);assert.equal(config.data.invite_only,true);
 });
 await t.test('real WebAuthn bootstrap and ten registrations per invitation',async()=>{
  alice=await signup('免费版测试管理员','LOCAL-QA-ONLY');assert.equal(alice.data.user.admin,true);
  assert.equal((await request('POST','/api/register/options',{name:'second',code:'LOCAL-QA-ONLY'})).status,403);
  const invite=await request('POST','/api/admin/invites/new',{note:'isolated test'},alice.cookie);assert.equal(invite.status,200,JSON.stringify(invite.data));
  bob=await signup('免费版测试伙伴',invite.data.invite.code);assert.equal(bob.data.user.admin,false);
  assert.equal((await request('GET','/api/inviter',null,bob.cookie)).data.inviterId,alice.data.user.id);
  for(let n=2;n<=10;n++)await signup('同码伙伴'+n,invite.data.invite.code);
  assert.equal((await request('POST','/api/register/options',{name:'eleventh',code:invite.data.invite.code})).status,403);
  const list=await request('GET','/api/admin/invites',null,alice.cookie);assert.equal(list.data.invites.find(i=>i.code===invite.data.invite.code).usedCount,10);
 });
 await t.test('wellness records use own D1 person, enforce media ownership and preserve target history',async()=>{
  const photo=(await request('POST','/api/life/upload',new Uint8Array(fixture),alice.cookie)).data.id;
  assert.equal((await request('POST','/api/life/checkin',{clientId:'foreign',photo},bob.cookie)).status,400);
  const one=await request('POST','/api/life/checkin',{clientId:'retry',photo,place:'虚构健身房'},alice.cookie);assert.equal(one.status,200,JSON.stringify(one.data));
  assert.equal((await request('POST','/api/life/checkin',{clientId:'retry',photo,place:'虚构健身房'},alice.cookie)).data.checkin.id,one.data.checkin.id);
  assert.equal((await request('GET','/api/life/me',null,alice.cookie)).data.checkins.length,1);assert.equal((await request('GET','/api/life/me',null,bob.cookie)).data.checkins,undefined);
  assert.equal((await request('GET','/api/life/asset?id='+photo,null,bob.cookie)).status,404);
  const targets={daily:{calories:2000,protein:100,carbs:250,fat:60}};
  const first=await request('PUT','/api/life/nutrition-config',{mode:'fixed',start:'2026-10-01',baseVersion:0,targets},alice.cookie);assert.equal(first.status,200,JSON.stringify(first.data));
  assert.equal((await request('PUT','/api/life/nutrition-config',{mode:'fixed',start:'2026-10-25',baseVersion:0,targets},alice.cookie)).status,409);
  assert.equal((await request('PUT','/api/life/nutrition-config',{mode:'fixed',start:'2026-10-25',baseVersion:first.data.nutritionConfig.version,targets},alice.cookie)).status,200);
  assert.equal((await request('GET','/api/life/me',null,alice.cookie)).data.nutritionHistory[0].start,'2026-10-01');
  const food=await request('POST','/api/life/food',{name:'自填食物',calories:100,protein:null,carbs:20,fat:1},alice.cookie);assert.equal(food.status,200);
  assert.equal((await request('POST','/api/life/food',{...food.data.food,name:'越权'},bob.cookie)).status,404);
  assert.equal((await request('POST','/api/life/report-layout',{summary:{}},alice.cookie)).status,400);
  const report=await request('POST','/api/life/report-layout',{consent:true,summary:{workouts:3,sets:20,weightKg:70,photo:'private'}},alice.cookie);assert.equal(report.status,200,JSON.stringify(report.data));assert.equal(report.data.design.palette,'green');assert.equal(JSON.parse(modelPayload.messages[1].content).weightKg,undefined);assert.equal(JSON.parse(modelPayload.messages[1].content).photo,undefined);
 });
 await t.test('whole-day food arrangements persist together in the own D1 document',async()=>{
  const body={date:'2026-10-27',clientId:'cf-recipe-day-01',meals:['breakfast','lunch','dinner','snack'].map(type=>({type,items:[{name:'米饭',grams:100,calories:130,protein:2.7,carbs:28.2,fat:.3}]}))};
  const saved=await request('POST','/api/life/meal-plan/day',body,alice.cookie);assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.plans.length,4);
  const retry=await request('POST','/api/life/meal-plan/day',body,alice.cookie);assert.deepEqual(retry.data.plans.map(p=>p.id),saved.data.plans.map(p=>p.id));
  assert.equal((await request('GET','/api/life/me',null,alice.cookie)).data.mealPlans.length,4);assert.equal((await request('GET','/api/life/me',null,bob.cookie)).data.mealPlans,undefined);
 });
 await t.test('last invite place is consumed atomically; a full code can expand to 1000 without history loss',async()=>{
  const code=(await request('POST','/api/admin/invites/new',{},alice.cookie)).data.invite.code;
  assert.equal((await request('POST','/api/admin/invites/update',{code,maxUses:1},alice.cookie)).status,200);
  const results=await Promise.all(['One','Two'].map(n=>request('POST','/api/register/password',{name:'Race'+n,code,password:'Strong-Race-Fixture!839'})));
  assert.equal(results.filter(x=>x.status===200).length,1,JSON.stringify(results));
  const before=(await request('GET','/api/admin/invites',null,alice.cookie)).data.invites.find(i=>i.code===code);
  assert.equal(before.usedCount,1);
  const after=(await request('POST','/api/admin/invites/update',{code,maxUses:1000},alice.cookie)).data.invite;
  assert.deepEqual(after.uses,before.uses);assert.equal(after.createdBy,before.createdBy);assert.equal(after.remaining,999);
  assert.equal((await request('POST','/api/admin/invites/update',{code,maxUses:0},alice.cookie)).status,400);
  await request('POST','/api/admin/invites/revoke',{code},alice.cookie);
  assert.equal((await request('POST','/api/admin/invites/update',{code,maxUses:1000},alice.cookie)).status,409);
 });
 await t.test('expanded invite keeps its uses and accepts the eleventh registration',async()=>{
  const list=await request('GET','/api/admin/invites',null,alice.cookie),old=list.data.invites.find(i=>i.usedCount===10);
  assert.equal((await request('POST','/api/admin/invites/update',{code:old.code,maxUses:100},bob.cookie)).status,403);
  assert.equal((await request('POST','/api/admin/invites/update',{code:old.code,maxUses:1001},alice.cookie)).status,400);
  const expanded=await request('POST','/api/admin/invites/update',{code:old.code,maxUses:100},alice.cookie);
  assert.equal(expanded.data.invite.usedCount,10);assert.equal(expanded.data.invite.remaining,90);
  await signup('扩容后第十一位',old.code);
  const after=await request('GET','/api/admin/invites',null,alice.cookie);assert.equal(after.data.invites.find(i=>i.code===old.code).usedCount,11);
 });
 await t.test('Android without WebAuthn: password registration, persistence, proof, reset and limits',async()=>{
  const invite=(await request('POST','/api/admin/invites/new',{},alice.cookie)).data.invite.code;
  const pw='Mountain-橙子-train!78',next='Sunshine-河流-coach!97';
  assert.equal((await request('POST','/api/register/password',{name:'安卓密码测试',password:pw,code:'WRONG'})).status,403);
  assert.equal((await request('POST','/api/register/password',{name:'安卓密码测试',password:'1234567890',code:invite})).status,400);
  let a=await request('POST','/api/register/password',{name:'安卓密码测试',password:pw,code:invite,email:'android@example.test'});assert.equal(a.status,200,JSON.stringify(a.data));
  assert.equal(a.data.user.admin,false);assert.equal(a.data.user.password,undefined);
  assert.equal((await request('GET','/api/me',null,a.cookie)).data.user.id,a.data.user.id);
  assert.equal((await request('POST','/api/register/password',{name:'安卓密码测试',password:pw,code:invite})).status,409);
  assert.equal((await request('POST','/api/login/password',{name:'安卓密码测试',password:'wrong'})).status,401);
  const login=await request('POST','/api/login/password',{name:'ANDROID@example.test',password:pw});assert.equal(login.status,200,JSON.stringify(login.data));assert.equal(login.data.user.id,a.data.user.id);
  assert.equal((await request('POST','/api/account/password',{next},a.cookie)).status,403);
  const changed=await request('POST','/api/account/password',{current:pw,next},a.cookie);assert.equal(changed.status,200,JSON.stringify(changed.data));
  assert.equal((await request('GET','/api/me',null,login.cookie)).status,401);
  assert.equal((await request('DELETE','/api/account/password',{current:next},changed.cookie)).status,409);
  const reset=await request('POST','/api/admin/user/password-reset',{id:a.data.user.id},alice.cookie);assert.equal(reset.status,200,JSON.stringify(reset.data));
  const redeemed=await request('POST','/api/login/password-reset',{name:'安卓密码测试',code:reset.data.code,next:pw});assert.equal(redeemed.status,200,JSON.stringify(redeemed.data));
  assert.equal((await request('POST','/api/login/password-reset',{name:'安卓密码测试',code:reset.data.code,next:pw})).status,400);
  assert.equal((await request('GET','/api/me',null,changed.cookie)).status,401);
  for(let i=0;i<8;i++)assert.equal((await request('POST','/api/login/password',{name:'brute-force-fixture',password:'bad'})).status,401);
  assert.equal((await request('POST','/api/login/password',{name:'brute-force-fixture',password:'bad'})).status,429);
  const proof=await request('POST','/api/login/options',{}),saved=await request('POST','/api/account/password',{next:pw,cid:proof.data.cid,credential:bob.key.assertion(proof.data.options.challenge)},bob.cookie);assert.equal(saved.status,200,JSON.stringify(saved.data));bob.cookie=saved.cookie;
  assert.equal((await request('POST','/api/login/password',{name:bob.data.user.name,password:pw})).status,200);
 });
 await t.test('real login signature, replay refusal and same-account device link',async()=>{
  const options=await request('POST','/api/login/options',{});const assertion={cid:options.data.cid,credential:alice.key.assertion(options.data.options.challenge)};
  const login=await request('POST','/api/login/verify',assertion);assert.equal(login.status,200,JSON.stringify(login.data));assert.equal(login.data.user.id,alice.data.user.id);
  assert.equal((await request('POST','/api/login/verify',assertion)).status,400);
  const proof=await request('POST','/api/login/options',{}),link=await request('POST','/api/account/device-link',{proof:'passkey',cid:proof.data.cid,credential:alice.key.assertion(proof.data.options.challenge)},alice.cookie);assert.equal(link.status,200,JSON.stringify(link.data));
  const more=await request('POST','/api/device-link/options',{code:link.data.code}),otherKey=softPasskey();assert.equal(more.status,200,JSON.stringify(more.data));
  const body={code:link.data.code,cid:more.data.cid,credential:otherKey.attestation(more.data.options.challenge,{origin})};const added=await request('POST','/api/device-link/verify',body);assert.equal(added.status,200,JSON.stringify(added.data));assert.equal(added.data.user.id,alice.data.user.id);
  assert.equal((await request('POST','/api/device-link/options',{code:link.data.code})).status,400);
 });
 await t.test('sync state idempotence, stale version and privacy',async()=>{
  const state={workouts:[{id:'test-workout',d:'2026-10-18',name:'测试训练',ex:[]}],routines:[],bodyweight:[],_ts:1};
  const put=await request('PUT','/api/data',{state,baseRev:0},alice.cookie);assert.equal(put.status,200,JSON.stringify(put.data));
  const own=await request('GET','/api/data',null,alice.cookie);assert.equal(own.data.state.workouts.length,1);
  assert.equal((await request('GET','/api/data',null,bob.cookie)).data.state,null);
  const conflict=await request('PUT','/api/data',{state,baseRev:0},alice.cookie);assert.equal(conflict.status,409);assert.equal(conflict.data.state.workouts.length,1);
 });
 await t.test('private diet, chunked image and video byte ranges',async()=>{
  const upload=await request('POST','/api/life/upload',new Uint8Array(fixture),alice.cookie);assert.equal(upload.status,200,JSON.stringify(upload.data));
  const id=upload.data.id;assert.equal((await request('GET','/api/life/asset?id='+id,null,bob.cookie)).status,404);
  const image=await fetch(origin+'/api/life/asset?id='+id,{headers:{Cookie:alice.cookie,Range:'bytes=0-15'}});assert.equal(image.status,206);assert.deepEqual(new Uint8Array(await image.arrayBuffer()),new Uint8Array(fixture.subarray(0,16)));
  const body={date:'2026-10-18',type:'lunch',items:[{name:'测试苹果',calories:95}],photo:id,clientId:'test-retry'};
  const meal=await request('POST','/api/life/meal',body,alice.cookie);assert.equal(meal.status,200,JSON.stringify(meal.data));assert.equal((await request('POST','/api/life/meal',body,alice.cookie)).data.meal.id,meal.data.meal.id);
  assert.deepEqual((await request('GET','/api/life/me',null,bob.cookie)).data.meals,[]);
  const tooBig=await request('POST','/api/life/upload',new Uint8Array(2*1024*1024+1),alice.cookie);assert.equal(tooBig.status,413);
 });
 await t.test('a new account without a profile is visible in follower rows and totals',async()=>{
  const invite=await request('POST','/api/admin/invites/new',{note:'follower regression'},alice.cookie);
  const fresh=await signup('尚未完善资料的新粉丝',invite.data.invite.code),id=fresh.data.user.id;
  const before=(await request('GET','/api/life/people?id='+alice.data.user.id,null,alice.cookie)).data.person.followers;
  assert.equal((await request('POST','/api/life/follow',{id:alice.data.user.id,following:true},fresh.cookie)).status,200);
  const profile=await request('GET','/api/life/people?id='+alice.data.user.id,null,alice.cookie),list=await request('GET','/api/life/people?relation=followers',null,alice.cookie);
  assert.equal(profile.data.person.followers,before+1);assert.equal(list.data.total,profile.data.person.followers);
  assert.equal(list.data.people.find(p=>p.id===id).nickname,'尚未完善资料的新粉丝');
  await request('POST','/api/life/follow',{id:alice.data.user.id,following:false},fresh.cookie);
  assert.equal((await request('GET','/api/life/people?id='+alice.data.user.id,null,alice.cookie)).data.person.followers,before);
  await request('POST','/api/life/notifications/read',{all:true},alice.cookie);
 });
 await t.test('community posts, follow, mutual private chat, notifications and challenge',async()=>{
  for(const account of [alice,bob])assert.equal((await request('PUT','/api/life/profile',{nickname:account.data.user.name},account.cookie)).status,200);
  const post=await request('POST','/api/life/post',{text:'仅用于本地验收',category:'workout',tags:['训练']},alice.cookie);assert.equal(post.status,200);
  assert.equal((await request('POST','/api/life/react',{id:post.data.post.id,action:'like',liked:true},bob.cookie)).status,200);
  assert.equal((await request('GET','/api/life/notifications',null,alice.cookie)).data.unread,1);
  assert.equal((await request('POST','/api/life/follow',{id:alice.data.user.id,following:true},bob.cookie)).status,200);
  assert.equal((await request('POST','/api/life/follow',{id:bob.data.user.id,following:true},alice.cookie)).status,200);
  const msg=await request('POST','/api/life/message',{to:alice.data.user.id,text:'测试加油',clientId:'test-message'},bob.cookie);assert.equal(msg.status,200,JSON.stringify(msg.data));
  const c=await request('POST','/api/life/challenge',{title:'免费验收',kind:'training',target:3,start:'2026-10-18',end:'2026-10-24'},alice.cookie);assert.equal(c.status,200,JSON.stringify(c.data));assert.equal(c.data.challenge.participants[0].count,1);
 });
 await t.test('shared post messages, private card visibility and optimized media permissions',async()=>{
  const upload=await request('POST','/api/life/upload',new Uint8Array(fixture),alice.cookie),asset=upload.data.id;
  const created=await request('POST','/api/life/post',{text:'消息卡片测试',media:[asset]},alice.cookie),id=created.data.post.id;
  const shared=await request('POST','/api/life/message',{to:bob.data.user.id,kind:'post',postId:id,clientId:'post-card-retry'},alice.cookie);assert.equal(shared.status,200,JSON.stringify(shared.data));assert.equal(shared.data.message.post.id,id);
  const again=await request('POST','/api/life/message',{to:bob.data.user.id,kind:'post',postId:id,clientId:'post-card-retry'},alice.cookie);assert.equal(again.data.message.id,shared.data.message.id);
  const changed=await request('POST','/api/life/message',{to:bob.data.user.id,text:'changed',clientId:'post-card-retry'},alice.cookie);assert.equal(changed.status,409);
  const other=await fetch(origin+'/api/life/asset?id='+asset,{headers:{Cookie:bob.cookie,Range:'bytes=0-9'}});assert.equal(other.status,206);assert.deepEqual(new Uint8Array(await other.arrayBuffer()),new Uint8Array(fixture.subarray(0,10)));
  await request('POST','/api/life/react',{id,action:'delete'},alice.cookie);const messages=await request('GET','/api/life/messages?with='+alice.data.user.id,null,bob.cookie);assert.equal(messages.data.messages.find(m=>m.id===shared.data.message.id).post,null);
  assert.equal((await fetch(origin+'/api/life/asset?id='+asset,{headers:{Cookie:bob.cookie}})).status,404);
  await request('POST','/api/life/follow',{id:alice.data.user.id,following:false},bob.cookie);assert.equal((await request('POST','/api/life/message',{to:alice.data.user.id,text:'no longer mutual'},bob.cookie)).status,403);
  const following=await request('GET','/api/life/people?relation=following',null,bob.cookie);assert.equal(following.data.people.length,0);
 });
 await t.test('music uploads, threaded comments and private administrator activity list',async()=>{
  const tracks=await request('GET','/api/life/music?q=力量',null,alice.cookie);assert.equal(tracks.data.tracks[0].id,'momentum');
  const bytes=fs.readFileSync(new URL('../../frontend/public/music/momentum.mp3',import.meta.url));
  const raw=await fetch(origin+'/api/life/upload',{method:'POST',headers:{Origin:origin,Cookie:alice.cookie,'Content-Type':'audio/mpeg'},body:bytes});assert.equal(raw.status,200);const {id:assetId}=await raw.json();
  assert.equal((await request('GET','/api/life/asset?id='+assetId,null,bob.cookie)).status,404);
  const made=await request('POST','/api/life/post',{text:'本地配乐验收',music:{assetId,start:1,duration:10},effects:{filter:'mono',sticker:'加油'}},alice.cookie);assert.equal(made.status,200,JSON.stringify(made.data));const postId=made.data.post.id;
  const probe=await fetch(origin+'/api/life/asset?id='+assetId,{headers:{Cookie:bob.cookie,Range:'bytes=0-15'}});assert.equal(probe.status,206);assert.equal(probe.headers.get('content-type'),'audio/mpeg');assert.equal((await probe.arrayBuffer()).byteLength,16);
  const body={postId,text:'继续加油',clientId:'comment-once'};
  const c=await request('POST','/api/life/comment',body,bob.cookie);assert.equal(c.status,200,JSON.stringify(c.data));assert.equal((await request('POST','/api/life/comment',body,bob.cookie)).data.comment.id,c.data.comment.id);
  const reply=await request('POST','/api/life/comment',{postId,text:'谢谢你',clientId:'reply-once',replyTo:c.data.comment.id},alice.cookie);assert.equal(reply.data.comment.parentId,c.data.comment.id);
  assert.equal((await request('POST','/api/life/comment/react',{postId,id:c.data.comment.id,action:'like',liked:true},alice.cookie)).data.comment.likeCount,1);
  assert.equal((await request('GET','/api/life/comments?post='+postId,null,bob.cookie)).data.items[0].replyCount,1);
  const admin=await request('GET','/api/admin/users',null,alice.cookie);assert.equal(admin.status,200);const member=admin.data.users.find(u=>u.id===bob.data.user.id);assert.ok(member.lastActiveAt);assert.ok(member.nickname);const second=await request('GET','/api/admin/users',null,alice.cookie);assert.equal(second.data.users.find(u=>u.id===bob.data.user.id).lastActiveAt,member.lastActiveAt);
  assert.equal((await request('GET','/api/admin/users',null,bob.cookie)).status,403);
 });
 await t.test('fitness AI reads private body data, explicit consent, native D1 and per-day limit',async()=>{
  const profile={nickname:'私密昵称不得发送',personality:'私密性格',heightCm:175,weightKg:70,bodyContext:'adult',bodyUpdatedAt:1};
  assert.equal((await request('PUT','/api/life/profile',profile,alice.cookie)).status,200);
  const privateView=(await request('GET','/api/life/people?id='+alice.data.user.id,null,bob.cookie)).data.person;assert.equal(privateView.heightCm,undefined);assert.equal(privateView.weightKg,undefined);
  const cur=(await request('GET','/api/data',null,alice.cookie)).data;await request('PUT','/api/data',{baseRev:cur.rev,state:{...cur.state,bodyweight:[{w:75,d:'2026-10-19',t:Date.now()}]}},alice.cookie);
  const intake={adult:true,place:'home',experience:'beginner',days:[1,3],equipment:[],minutes:30};
  assert.equal((await request('POST','/api/life/fitness-plan',{intake},alice.cookie)).status,400);
  const result=await request('POST','/api/life/fitness-plan',{intake,consent:true,photos:[{kind:'current',data:'data:image/jpeg;base64,'+fixture.toString('base64')}]},alice.cookie);assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.physical.weightKg,75);assert.equal(result.data.plan.sessions.length,2);assert.ok(!JSON.stringify(modelPayload).includes(profile.nickname));assert.ok(!JSON.stringify(modelPayload).includes(profile.personality));
  for(let n=0;n<4;n++)assert.equal((await request('POST','/api/life/fitness-plan',{intake,consent:true,previous:result.data.plan,refine:'保持动作轻量'},alice.cookie)).status,200);
  assert.equal((await request('POST','/api/life/fitness-plan',{intake,consent:true},alice.cookie)).status,429);
 });
 await t.test('message center receipt clears existing D1 reminders and preserves later messages',async()=>{
  await request('POST','/api/life/follow',{id:alice.data.user.id,following:true},bob.cookie);
  const snap=(await request('GET','/api/life/notifications',null,alice.cookie)).data;assert.ok(snap.readThrough);
  const late=await request('POST','/api/life/message',{to:alice.data.user.id,text:'消息中心打开后到达',clientId:'after-read-snapshot'},bob.cookie);assert.equal(late.status,200,JSON.stringify(late.data));
  const read=await request('POST','/api/life/notifications/read',{through:snap.readThrough},alice.cookie);assert.equal(read.status,200,JSON.stringify(read.data));
  const remaining=(await request('GET','/api/life/unread',null,alice.cookie)).data;assert.equal(remaining.messages,1);assert.equal(remaining.interactions,0);
  const next=(await request('GET','/api/life/notifications',null,alice.cookie)).data;
  await request('POST','/api/life/notifications/read',{through:next.readThrough},alice.cookie);
  assert.equal((await request('GET','/api/life/unread',null,alice.cookie)).data.total,0);
 });
 await t.test('unauthed APIs never fall back to static SPA and logout invalidates session',async()=>{
  assert.equal((await request('GET','/api/life/feed')).status,401);
  assert.equal((await request('GET','/api/admin/invites',null,bob.cookie)).status,403);
  assert.equal((await request('POST','/api/logout',{},bob.cookie)).status,200);
  assert.equal((await request('GET','/api/me',null,bob.cookie)).status,401);
 });
 await t.test('D1 profile refresh preserves identity across weight-only writes and protects music connection status',async()=>{
  const first=await request('PUT','/api/life/profile',{nickname:'资料持久化验收',bio:'第一行\n第二行',heightCm:176,weightKg:72,personality:'测试性格',avatar:'data:image/jpeg;base64,'+fixture.toString('base64')},alice.cookie);assert.equal(first.status,200);
  const old=first.data.profile,patch=await request('PATCH','/api/life/profile',{weightKg:73,bodyUpdatedAt:Date.now()+500},alice.cookie);assert.equal(patch.status,200,JSON.stringify(patch.data));
  const loaded=await request('GET','/api/life/me',null,alice.cookie);assert.equal(loaded.data.profile.bio,old.bio);assert.equal(loaded.data.profile.avatar,old.avatar);assert.equal(loaded.data.profile.heightCm,176);assert.equal(loaded.data.profile.weightKg,73);
  assert.equal((await request('PUT','/api/life/profile',{baseProfileVersion:old.version,bio:'新版简介'},alice.cookie)).status,200);
  assert.equal((await request('PUT','/api/life/profile',{baseProfileVersion:old.version,bio:'过时简介'},alice.cookie)).status,409);
  const loginOptions=await request('POST','/api/login/options',{}),freshBob=await request('POST','/api/login/verify',{cid:loginOptions.data.cid,credential:bob.key.assertion(loginOptions.data.options.challenge)});assert.equal(freshBob.status,200);assert.equal((await request('GET','/api/life/music/connection',null,freshBob.cookie)).status,403);
  assert.equal((await request('POST','/api/life/music/connection/test',{},alice.cookie)).data.stage,'configuration');
 });

 await t.test('growth share allowlist, disabling owner and report lifecycle on real D1',async()=>{
  const prof=await request('PUT','/api/life/profile',{trainingGoal:'strength',experience:'beginner',onboardingCompleted:true},alice.cookie);assert.equal(prof.status,200);assert.equal(prof.data.profile.trainingGoal,'strength');
  assert.equal((await request('POST','/api/life/share-config',{enabled:true,fields:['weightKg'],consent:true},alice.cookie)).status,400);
  const share=await request('POST','/api/life/share-config',{enabled:true,fields:['nickname','growth'],consent:true},alice.cookie);assert.equal(share.status,200,JSON.stringify(share.data));const token=share.data.profile.externalShare.token;
  const preview=await request('GET','/api/life/public-growth?token='+token);assert.equal(preview.status,200);assert.ok(preview.data.includes('noindex'));assert.ok(!preview.data.includes('weightKg'));assert.ok(preview.headers.get('cache-control').includes('no-store'));
  await request('POST','/api/life/share-config',{enabled:false},alice.cookie);assert.equal((await request('GET','/api/life/public-growth?token='+token)).status,404);
  const newCode=(await request('POST','/api/admin/invites/new',{},alice.cookie)).data.invite.code;
  const peer=await request('POST','/api/register/password',{code:newCode,name:'Growth owner fixture',password:'Growth-Fixture-Long!830'});assert.equal(peer.status,200);
  const next=await request('POST','/api/life/share-config',{enabled:true,fields:['growth'],consent:true},peer.cookie);assert.equal(next.status,200,JSON.stringify(next.data));const otherToken=next.data.profile.externalShare.token;
  await request('POST','/api/admin/user/disable',{id:peer.data.user.id,disabled:true},alice.cookie);assert.equal((await request('GET','/api/life/public-growth?token='+otherToken)).status,404);
  await request('POST','/api/admin/user/disable',{id:peer.data.user.id,disabled:false},alice.cookie);
  const p=await request('POST','/api/life/post',{text:'测试问题',category:'question'},alice.cookie);assert.equal(p.status,200);
  const r=await request('POST','/api/life/report',{kind:'post',id:p.data.post.id,reason:'需要管理员复核'},alice.cookie);assert.equal(r.status,200);
  assert.equal((await request('GET','/api/life/admin/reports',null,alice.cookie)).data.reports.length,1);
  assert.equal((await request('POST','/api/life/admin/reports',{id:r.data.id,status:'resolved',note:'已人工核查',removeContent:true},alice.cookie)).status,200);
  assert.equal((await request('GET','/api/life/feed?post='+p.data.post.id,null,alice.cookie)).data.posts.length,0);
  const metrics=await request('GET','/api/admin/usage',null,alice.cookie);assert.equal(metrics.status,200);assert.ok(metrics.data.registered>1);assert.ok(!JSON.stringify(metrics.data).includes('workouts'));assert.ok(metrics.data.quality.some(q=>q.rowsRead>0));assert.ok(metrics.data.groups.goal.length>0);
 });

 await t.test('Capacitor pairing uses one-shot codes, isolated bearer sessions, CORS and revocation',async()=>{
  const code=(await request('POST','/api/pair/create',{},alice.cookie)).data.code;assert.ok(code);
  const native=async(path,method='GET',body,token)=>{const r=await fetch(origin+path,{method,headers:{Origin:'capacitor://localhost',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {r,data:await r.json()}};
  const paired=await native('/api/pair/redeem','POST',{code});assert.equal(paired.r.status,200,JSON.stringify(paired.data));const token=paired.data.token;assert.ok(token);
  assert.equal((await native('/api/pair/redeem','POST',{code})).r.status,400);
  const me=await native('/api/me','GET',null,token);assert.equal(me.r.status,200);assert.equal(me.r.headers.get('access-control-allow-origin'),'capacitor://localhost');
  const noProof=await native('/api/data','PUT',{state:{workouts:[],routines:[]}});assert.equal(noProof.r.status,403);
  const hostile=await fetch(origin+'/api/data',{method:'PUT',headers:{Origin:'https://evil.test',Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({state:{workouts:[],routines:[]}})});assert.equal(hostile.status,403);
  const preflight=await fetch(origin+'/api/data',{method:'OPTIONS',headers:{Origin:'https://localhost','Access-Control-Request-Headers':'authorization,content-type'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-credentials'),null);
  const denied=await fetch(origin+'/api/data',{method:'OPTIONS',headers:{Origin:'https://evil.test'}});assert.equal(denied.status,403);
  assert.equal((await native('/api/logout','POST',{},token)).r.status,200);assert.equal((await native('/api/data','GET',null,token)).r.status,401);
  assert.equal((await request('GET','/api/me',null,alice.cookie)).status,200);
 });

});
