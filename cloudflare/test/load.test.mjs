import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import crypto from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),origin='http://localhost:13114',cli=path.join(root,'node_modules/wrangler/bin/wrangler.js');
test('isolated D1: 1000 simulated accounts, 1000 posts and 30 concurrent independent training saves',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opengym-load-')),assets=path.join(dir,'assets');fs.mkdirSync(assets);fs.writeFileSync(path.join(assets,'index.html'),'<title>QA only</title>');
 const config={name:'opengym-isolated-load',main:path.join(root,'src/worker.js'),compatibility_date:'2026-10-18',compatibility_flags:['nodejs_compat'],assets:{directory:assets,binding:'ASSETS'},d1_databases:[{binding:'DB',database_name:'qa-only',database_id:'00000000-0000-0000-0000-000000000001',migrations_dir:path.join(root,'migrations')}],vars:{ORIGIN:origin,RP_ID:'localhost',MEDIA_STORE:'d1'}};
 const cfg=path.join(dir,'wrangler.json');fs.writeFileSync(cfg,JSON.stringify(config));const env={...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'};
 const run=args=>{const r=spawnSync(process.execPath,[cli,'--config',cfg,...args],{cwd:root,env,encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);return r};
 run(['d1','migrations','apply','DB','--local','--persist-to',dir]);
 const quote=s=>"'"+JSON.stringify(s).replaceAll("'","''")+"'",values=[],tokens=[];
 for(let i=0;i<1000;i++){
  const id='fixture-user-'+i;values.push(`('auth','user:${id}',${quote({id,name:'QA '+i,sv:0,created:'2026-10-01T00:00:00Z'})})`,`('life','people:${id}',${quote({profile:{nickname:'QA '+i},meals:[]})})`,`('life','posts:post-${i}',${quote({id:'post-'+i,uid:id,text:'训练记录',category:'workout',media:[],comments:[],likes:[],createdAt:i+1})})`);
  if(i<30){const token='isolated-session-'+i,hash=crypto.createHash('sha256').update(token).digest('hex');tokens.push(token);values.push(`('auth','session:${hash}',${quote({uid:id,sv:0,exp:Date.now()+3600000})})`)}
 }
 const seed=path.join(dir,'seed.sql');fs.writeFileSync(seed,Array.from({length:Math.ceil(values.length/100)},(_,i)=>'INSERT INTO documents(scope,id,body) VALUES '+values.slice(i*100,i*100+100).join(',')+';').join('\n'));run(['d1','execute','DB','--local','--persist-to',dir,'--file',seed]);
 const child=spawn(process.execPath,[cli,'--config',cfg,'dev','--local','--persist-to',dir,'--port','13114','--show-interactive-dev-session=false'],{cwd:root,env,stdio:['ignore','pipe','pipe'],detached:true});let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);t.after(()=>{try{process.kill(-child.pid,'SIGTERM')}catch{}fs.rmSync(dir,{recursive:true,force:true})});
 for(let n=0;n<100;n++){try{if((await fetch(origin+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));if(n===99)assert.fail(logs)}
 const latencies=[],responses=await Promise.all(tokens.map(async(token,i)=>{
  const started=performance.now(),r=await fetch(origin+'/api/data',{method:'PUT',headers:{Origin:origin,Cookie:'gym_cf='+token,'Content-Type':'application/json','cf-connecting-ip':'192.0.2.'+(i+1)},body:JSON.stringify({baseRev:0,state:{unit:'kg',routines:[],workouts:[{id:'w'+i,d:'2026-10-24',entries:[{id:'x',sets:[{done:true,r:8,w:20}]}]}]}})});latencies.push(performance.now()-started);return {status:r.status,data:await r.json()};
 }));
 assert.equal(responses.filter(r=>r.status===200).length,30,JSON.stringify(responses));
 const reads=await Promise.all(tokens.map(async(token,i)=>{const r=await fetch(origin+'/api/data',{headers:{Cookie:'gym_cf='+token}});const d=await r.json();assert.equal(d.state.workouts.length,1);assert.equal(d.state.workouts[0].id,'w'+i);assert.ok(d.state.workouts[0].savedAt);return d}));assert.equal(reads.length,30);
 const reacts=await Promise.all(tokens.map(async(token,i)=>{const r=await fetch(origin+'/api/life/react',{method:'POST',headers:{Origin:origin,Cookie:'gym_cf='+token,'Content-Type':'application/json','cf-connecting-ip':'192.0.2.'+(i+1)},body:JSON.stringify({id:'post-'+i,action:'like',liked:true})});return {status:r.status,data:await r.json()}}));assert.equal(reacts.filter(r=>r.status===200).length,30,JSON.stringify(reacts));assert.ok(reacts.every(r=>r.data.post.likeCount===1));
 const feed=await fetch(origin+'/api/life/feed?limit=8&compact=1',{headers:{Cookie:'gym_cf='+tokens[0]}}),body=await feed.json();assert.equal(feed.status,200,JSON.stringify(body));assert.equal(body.posts.length,8);assert.ok(body.next);assert.equal(body.total,1000);
 latencies.sort((a,b)=>a-b);t.diagnostic('Local-only 30 concurrent saves: p50='+Math.round(latencies[14])+' ms, p95='+Math.round(latencies[28])+' ms; not a production capacity guarantee.');
});
