import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {Repository,lifestyleAsset} from '../src/repository.js';
import {r2UploadRoute,uploadUsage,cleanupUploads,PART_SIZE} from '../src/r2-media.js';
const digest=b=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const sql=new DatabaseSync(':memory:');for(const f of ['0001_initial.sql','0002_r2_uploads.sql'])sql.exec(fs.readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const wrap=(q,args=[])=>({bind(...a){return wrap(q,a)},async first(){return sql.prepare(q).get(...args)||null},async all(){return {results:sql.prepare(q).all(...args)}},async run(){const r=sql.prepare(q).run(...args);return {meta:{changes:r.changes}}}});
 const db={prepare:wrap,async batch(st){sql.exec('BEGIN');try{const r=[];for(const s of st)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
 const objects=new Map(),uploads=new Map();let crash=false,abortFail=false;
 const bucket={async createMultipartUpload(key,options){const uploadId=crypto.randomUUID();uploads.set(uploadId,{key,options,parts:new Map()});return {uploadId,abort:async()=>uploads.delete(uploadId)}},resumeMultipartUpload(key,id){return {async uploadPart(n,b){const u=uploads.get(id);if(!u)throw Error('NoSuchUpload');u.parts.set(n,b);return {etag:digest(b)}},async complete(parts){const u=uploads.get(id);if(!u)throw Error('NoSuchUpload');const b=Buffer.concat(parts.map(p=>Buffer.from(u.parts.get(p.partNumber)))),o={size:b.length,customMetadata:u.options.customMetadata,httpEtag:'"test-etag"',bytes:b};objects.set(key,o);uploads.delete(id);if(crash){crash=false;throw Error('lost reply')}return o},async abort(){if(abortFail)throw Error('temporary network');uploads.delete(id)}}},async head(key){return objects.get(key)||null},async get(key,opts){const o=objects.get(key);if(!o)return null;const b=opts?.range?o.bytes.subarray(opts.range.offset,opts.range.offset+opts.range.length):o.bytes;return {...o,body:new Blob([b]).stream()}},async delete(key){objects.delete(key)}};
 const repo=new Repository(db),call=async(method,path,body={},owner='a')=>{const raw=body instanceof Uint8Array;return r2UploadRoute(new Request('https://gym.test/api/uploads/'+path,{method,...(raw?{body}:{}),headers:{}}),repo,bucket,{id:owner},raw?{}:body,async(r,max)=>{const b=new Uint8Array(await r.arrayBuffer());if(b.length>max)throw Object.assign(Error('large'),{status:413});return b})};
 const init=async(bytes,mime='video/mp4',owner='a')=>{const hashes=[];for(let i=0;i<bytes.length;i+=PART_SIZE)hashes.push(digest(bytes.subarray(i,i+PART_SIZE)));const body={mime,size:bytes.length,hashes,fingerprint:digest(`${mime}:${bytes.length}:${hashes.join(',')}`),name:'test.mp4'};return {body,...await (await call('POST','init',body,owner)).json()}};
 return {sql,repo,bucket,call,init,crash:()=>crash=true,abortFail:v=>abortFail=v};
}
const video=n=>{const b=new Uint8Array(n);b.set([0,0,0,24,102,116,121,112]);return b};
test('R2 resume, byte verification, private media, lost reply and completion idempotence',async()=>{
 const f=fixture(),b=video(PART_SIZE+123),s=await f.init(b);await assert.rejects(()=>f.call('GET',s.id,{},'b'),e=>e.status===404);
 await assert.rejects(()=>f.call('PUT',s.id+'/parts/1',new Uint8Array(PART_SIZE)),e=>e.status===400);
 await f.call('PUT',s.id+'/parts/1',b.subarray(0,PART_SIZE));assert.equal((await f.init(b)).uploadedParts.length,1);
 await assert.rejects(()=>f.call('POST',s.id+'/complete'),e=>e.status===409);
 await f.call('PUT',s.id+'/parts/2',b.subarray(PART_SIZE));f.crash();assert.equal((await f.call('POST',s.id+'/complete')).status,200);
 assert.equal((await (await f.call('POST',s.id+'/complete')).json()).id,s.id);assert.equal((await f.init(b)).complete,true);
 assert.equal((await uploadUsage(f.repo,'a')).bytes,b.length);assert.equal((await uploadUsage(f.repo,'a')).reservedBytes,0);
 const req=new Request('https://gym.test',{headers:{Range:'bytes=5242878-5242883'}});
 const range=await lifestyleAsset(f.repo,'a',s.id,req,f.bucket);assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,6);
 await assert.rejects(()=>lifestyleAsset(f.repo,'b',s.id,req,f.bucket),e=>e.status===404);
 await f.repo.db.prepare("INSERT INTO documents VALUES('life','posts:p',?)").bind(JSON.stringify({id:'p',uid:'a',media:[s.id]})).run();assert.equal((await lifestyleAsset(f.repo,'b',s.id,req,f.bucket)).status,206);
 await f.repo.db.prepare("INSERT INTO documents VALUES('life','blocks:b','[\"a\"]')").run();await assert.rejects(()=>lifestyleAsset(f.repo,'b',s.id,req,f.bucket),e=>e.status===404);f.sql.close();
});
test('R2 quota reservations include pending and legacy bytes; failed cleanup retains quota',async()=>{
 const f=fixture(),s=await f.init(video(100));f.abortFail(true);await assert.rejects(()=>f.call('DELETE',s.id));assert.equal((await uploadUsage(f.repo,'a')).bytes,100);
 f.abortFail(false);await f.call('DELETE',s.id);assert.equal((await uploadUsage(f.repo,'a')).bytes,0);
 const q="INSERT INTO media_uploads(id,owner,fingerprint,name,mime,size,object_key,hashes,status,created,expires) VALUES(?,?,?,'x','video/mp4',?,?,'[]','pending',0,1)";
 for(let i=0;i<5;i++)f.sql.prepare(q).run('q'+i,'a','f'+i,200*1024*1024,'q'+i);
 assert.throws(()=>f.sql.prepare(q).run('no','a','extra',25*1024*1024,'no'),/user-media-full/);
 f.sql.prepare('INSERT INTO blobs VALUES(?,?,?,?,?)').run('old','a','image/jpeg',20*1024*1024,0);assert.throws(()=>f.sql.prepare(q).run('no','a','extra',5*1024*1024,'no'),/user-media-full/);
 await cleanupUploads(f.repo,f.bucket);assert.equal((await uploadUsage(f.repo,'a')).bytes,20*1024*1024);f.sql.close();
});
test('R2 video ranges, private no-store, HEAD and rejection over 200 MiB',async()=>{
 const f=fixture(),b=video(100),s=await f.init(b);await f.call('PUT',s.id+'/parts/1',b);await f.call('POST',s.id+'/complete');
 for(const [range,status,length] of [['bytes=0-1',206,2],['bytes=-10',206,10],['bytes=100-',416,0],['bytes=0-1,5-6',416,0]]){const r=await lifestyleAsset(f.repo,'a',s.id,new Request('https://gym.test',{headers:{Range:range}}),f.bucket);assert.equal(r.status,status);assert.equal((await r.arrayBuffer()).byteLength,length)}
 const head=await lifestyleAsset(f.repo,'a',s.id,new Request('https://gym.test',{method:'HEAD'}),f.bucket);assert.equal(head.headers.get('content-length'),'100');assert.equal(head.headers.get('cache-control'),'private, no-store');
 await assert.rejects(()=>f.call('POST','init',{mime:'video/mp4',size:209715201}),e=>e.status===413);f.sql.close();
});

test('site-wide R2 cap is enforced across owners and cannot be bypassed by concurrent reservations',()=>{
 const f=fixture(),q="INSERT INTO media_uploads(id,owner,fingerprint,name,mime,size,object_key,hashes,status,created,expires) VALUES(?,?,?,'x','video/mp4',?,?,'[]','pending',0,1)";
 for(let i=0;i<40;i++)f.sql.prepare(q).run('s'+i,'owner'+Math.floor(i/5),'h'+i,200*1024*1024,'s'+i);
 f.sql.prepare(q).run('last','owner8','last',192*1024*1024,'last');
 assert.throws(()=>f.sql.prepare(q).run('extra','another','extra',1,'extra'),/site-media-full/);f.sql.close();
});
