// Explicit live smoke test. Uses a generated apple illustration, never a user's meal/photo.
// Run from app/: node --env-file=.env.ai.local scripts/test-food-ai.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.env.FOOD_AI_API_KEY)throw new Error('请先配置后端密钥。');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gym-food-live-'));const secret=crypto.randomBytes(32).toString('hex');
fs.writeFileSync(path.join(dir,'secret'),secret,{mode:0o600});
fs.writeFileSync(path.join(dir,'db.json'),JSON.stringify({users:[{id:'vision-test',name:'视觉测试'}],creds:[],subs:[],invites:[]}));
const child=spawn(process.execPath,['server.js'],{cwd:path.join(root,'api'),env:{...process.env,DATA_DIR:dir,HOST:'127.0.0.1',PORT:'0',COACH_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',()=>{});
try{
  let port;for(let i=0;i<100;i++){port=/gym-api on :(\d+)/.exec(log)?.[1];if(port)break;await new Promise(r=>setTimeout(r,50))}
  if(!port)throw new Error('测试服务未启动。');
  const payload=`vision-test:${Date.now()+600000}:0`;const token=payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  const headers={Authorization:'Bearer '+token,Origin:'http://localhost:8080'};const base=`http://127.0.0.1:${port}/api/life/`;
  const upload=await fetch(base+'upload',{method:'POST',headers:{...headers,'Content-Type':'image/jpeg'},body:fs.readFileSync(path.join(root,'api/test/fixtures/lifestyle-apple.jpg'))});
  const photo=await upload.json();if(!upload.ok)throw new Error('测试图片上传失败。');
  const adviceOnly=process.argv.includes('--advice-only');
  const response=await fetch(base+(adviceOnly?'advice':'recognize'),{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(adviceOnly?{items:[{name:'测试苹果',grams:180,calories:95,protein:.5,carbs:25,fat:.3}]}:{photo:photo.id,hint:'这是接口测试用的食物插画，若能辨认食物请估算，无法辨认则返回空数组。'}),signal:AbortSignal.timeout(70000)});
  const result=await response.json();const me=await fetch(base+'me',{headers}).then(r=>r.json());
  console.log(JSON.stringify({status:response.status,estimated:result.estimated,model:result.model,food:result.items?.map(x=>x.name),mealStyle:result.mealStyle,hasMealAdvice:!!result.mealAdvice,hasStyleReason:!!result.styleReason,adviceCount:result.items?.filter(x=>x.advice).length,storedMeals:me.meals.length,error:result.error||null}));
  if(!response.ok)process.exitCode=1;
}finally{child.kill('SIGKILL');fs.rmSync(dir,{recursive:true,force:true})}
