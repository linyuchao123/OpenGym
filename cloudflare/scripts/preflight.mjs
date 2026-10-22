import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {EXDB} from '../../frontend/src/lib/exercises-data.js';
const planner=JSON.parse(fs.readFileSync(new URL('../../api/shared/plan-exercises.json',import.meta.url),'utf8'));
for(const e of planner){const original=EXDB.find(x=>x.id===e.id);if(!original||original.n!==e.name||original.eq!==e.equipment)throw new Error('Planner catalogue drift: '+e.id)}
const config=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const deny=['durable_objects','queues','workflows','containers','ai','vectorize','browser'];
for(const key of deny)if(config[key])throw new Error('Strict free preset refuses binding: '+key);
const deployOrigin=new URL(config.vars.ORIGIN);
if(config.vars.MEDIA_STORE!=='r2'||deployOrigin.protocol!=='https:'||deployOrigin.origin!==config.vars.ORIGIN||config.routes?.[0]?.pattern!==deployOrigin.hostname||config.vars.RP_ID!==deployOrigin.hostname)throw new Error('Origin, passkey RP or free media preset mismatch');
if(config.d1_databases.length!==1||config.d1_databases[0].database_id==='00000000-0000-0000-0000-000000000000')throw new Error('Configure the project D1 database first');
if(!config.assets.run_worker_first.includes('/exercise-media/clip/*'))throw new Error('Safari exercise clip Range route missing');
if(config.r2_buckets?.length!==1||config.r2_buckets[0].binding!=='MEDIA'||config.r2_buckets[0].bucket_name!=='opengym-media'||config.vars.SITE_MEDIA_LIMIT_MB!=='8192'||config.vars.USER_MEDIA_LIMIT_MB!=='1024')throw new Error('Approved R2 bucket or quota mismatch');
const r2Migration=fs.readFileSync(new URL('../migrations/0002_r2_uploads.sql',import.meta.url),'utf8');
if(!r2Migration.includes('8589934592')||!r2Migration.includes('1073741824'))throw new Error('R2 quota triggers missing');
const migration=fs.readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8');
if(!migration.includes('104857600')||!migration.includes('20971520'))throw new Error('Free media quota triggers missing');
// Dev serves catalogue/media directly; a Vite build alone does not include these files.
// Check the actual deployment directory, including binary signatures (not Git LFS pointers).
const assets=fileURLToPath(new URL('../../frontend/dist/',import.meta.url));
let mediaCount=0;
for(const [dir,ext,signature] of [['still','.webp','RIFF'],['clip','.mp4','ftyp']]){
  const source=new URL('../../catalogue/media/'+dir+'/',import.meta.url);
  const names=fs.readdirSync(source).filter(name=>name.endsWith(ext));
  if(!names.length)throw new Error('Empty catalogue: '+dir);
  for(const name of names){
    const target=path.join(assets,'exercise-media',dir,name);
    if(!fs.existsSync(target))throw new Error('Exercise media missing; run npm run build: '+target);
    const size=fs.statSync(target).size;
    if(size!==fs.statSync(new URL(name,source)).size)throw new Error('Incomplete exercise media: '+name);
    const fd=fs.openSync(target,'r');
    const header=Buffer.alloc(12);
    try{fs.readSync(fd,header,0,12,0);}finally{fs.closeSync(fd);}
    if(header.toString('ascii',dir==='clip'?4:0,dir==='clip'?8:4)!==signature || (dir==='still'&&header.toString('ascii',8,12)!=='WEBP'))throw new Error('Invalid exercise media: '+name);
    mediaCount++;
  }
}
if(!fs.existsSync(path.join(assets,'exercise-media','NOTICE.md')))throw new Error('Exercise media licence notice missing');
// Include alternate male/female drawings, not just the catalogue's default figure.
for(const ex of EXDB){
  const refs=[ex.img&&'still/'+ex.img,ex.gif&&'clip/'+ex.gif];
  for(const id of [ex.fv,ex.mv].filter(Boolean))refs.push('still/'+id+'.webp','clip/'+id+'.mp4');
  for(const ref of refs.filter(Boolean))if(!fs.existsSync(path.join(assets,'exercise-media',ref)))throw new Error('Catalogue references missing media: '+ref);
}
for(const id of ['momentum','morning','breathe']){const file=path.join(assets,'music',id+'.mp3');if(!fs.existsSync(file)||fs.statSync(file).size>2*1024*1024)throw new Error('Missing or oversized music: '+id);const h=fs.readFileSync(file).subarray(0,3);if(h.toString()!=='ID3'&&!(h[0]===255&&(h[1]&224)===224))throw new Error('Invalid MP3: '+id)}
if(!fs.existsSync(path.join(assets,'music','NOTICE.txt'))||!config.assets.run_worker_first.includes('/music/*'))throw new Error('Music notice or Safari audio route missing');
const files=fs.readdirSync(assets,{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile());
if(files.length>20000)throw new Error('Workers Free static asset count exceeded');
for(const entry of files)if(fs.statSync(path.join(entry.parentPath,entry.name)).size>25*1024*1024)throw new Error('Workers static asset exceeds 25 MiB: '+entry.name);
console.log(`Static assets OK: ${mediaCount} exercise media files; ${files.length}/20000 free asset slots.`);
console.log('Preflight OK: private R2 media binding, 1 GiB/user + 8 GiB/site reservations, unchanged domain/RP; other paid bindings refused.');
