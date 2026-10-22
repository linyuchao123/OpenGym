import {r2Response} from './r2-media.js';
// D1 stores ordinary JSON documents and chunked private blobs, no ephemeral filesystem.
// Revision checks and writes share one D1 transaction: a raced write never overwrites data.
export class HttpError extends Error { constructor(status,message,code){super(message);this.status=status;this.code=code} }
export class Repository {
 constructor(db){this.db=db}
 async load(scope){
  const result=await this.db.batch([this.db.prepare('SELECT rev FROM versions WHERE scope=?').bind(scope),this.db.prepare('SELECT id,body FROM documents WHERE scope=? ORDER BY id').bind(scope)]);
  return {scope,rev:result[0].results[0]?.rev||0,rows:new Map(result[1].results.map(r=>[r.id,r.body]))};
 }
 async save(snapshot,rows){
  const changes=[];
  for(const [id,body] of rows){if(body.length>1500000)throw new HttpError(413,'单份记录过大，请先备份整理。');if(snapshot.rows.get(id)!==body)changes.push(this.db.prepare('INSERT INTO documents(scope,id,body) VALUES(?,?,?) ON CONFLICT(scope,id) DO UPDATE SET body=excluded.body').bind(snapshot.scope,id,body))}
  for(const id of snapshot.rows.keys())if(!rows.has(id))changes.push(this.db.prepare('DELETE FROM documents WHERE scope=? AND id=?').bind(snapshot.scope,id));
  if(!changes.length)return;
  if(changes.length>90)throw new HttpError(413,'单次更改过多，请分批导入。');
  const scope=snapshot.scope;
  try{await this.db.batch([
   this.db.prepare('INSERT INTO revision_checks(scope,expected) VALUES(?,?)').bind(scope,snapshot.rev),...changes,
   this.db.prepare('INSERT INTO versions(scope,rev) VALUES(?,1) ON CONFLICT(scope) DO UPDATE SET rev=rev+1').bind(scope),
   this.db.prepare('DELETE FROM revision_checks WHERE scope=?').bind(scope)
  ])}catch(e){if(String(e).includes('revision-conflict'))throw new HttpError(409,'记录刚在其他设备更新，请刷新后重试。','conflict');throw e}
  snapshot.rev++;snapshot.rows=new Map(rows);
 }
 async read(scope,id){const row=await this.db.prepare('SELECT body FROM documents WHERE scope=? AND id=?').bind(scope,id).first();return row?JSON.parse(row.body):null}
 async throttle(key,limit=30,seconds=60){
  const now=Date.now(),expires=now+seconds*1000;
  const row=await this.db.prepare('INSERT INTO rate_limits(key,hits,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN expires<? THEN 1 ELSE hits+1 END, expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING hits').bind(key,expires,now,now).first();
  if(row.hits>limit)throw new HttpError(429,'操作太频繁，请稍后再试。');
 }
 async putBlob(id,owner,mime,bytes){
  const existing=await this.blobMeta(id);if(existing){if(existing.owner!==owner||existing.mime!==mime||existing.size!==bytes.byteLength)throw new HttpError(409,'重复上传的素材不一致。');return;}
  if(bytes.byteLength>2*1024*1024)throw new HttpError(413,'免费首版单个文件最多 2 MB；视频请先压缩。','media-too-large');
  const meta=this.db.prepare('INSERT INTO blobs(id,owner,mime,size,created) VALUES(?,?,?,?,?)').bind(id,owner,mime,bytes.byteLength,Date.now());
  const statements=[meta];for(let i=0;i<bytes.byteLength;i+=128*1024)statements.push(this.db.prepare('INSERT INTO blob_parts(id,part,bytes) VALUES(?,?,?)').bind(id,i/(128*1024),bytes.slice(i,i+128*1024)));
  try{await this.db.batch(statements)}catch(e){const saved=await this.blobMeta(id);if(saved&&saved.owner===owner&&saved.mime===mime&&saved.size===bytes.byteLength)return;if(String(e).includes('media-full'))throw new HttpError(413,'免费媒体容量已满（本站100 MB，每人20 MB），请备份整理后重试。','media-quota');throw e}
 }
 async blobMeta(id){return this.db.prepare('SELECT * FROM blobs WHERE id=?').bind(id).first()}
 async getBlob(id){
  const {results}=await this.db.prepare('SELECT bytes FROM blob_parts WHERE id=? ORDER BY part').bind(id).all();
  if(!results.length)throw new HttpError(404,'素材不存在。','media-missing');
  const parts=results.map(r=>new Uint8Array(r.bytes)),out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length}return out;
 }
 async getBlobRange(id,start,end){
  const first=Math.floor(start/(128*1024)),last=Math.floor(end/(128*1024));
  const {results}=await this.db.prepare('SELECT bytes FROM blob_parts WHERE id=? AND part BETWEEN ? AND ? ORDER BY part').bind(id,first,last).all();
  if(!results.length)throw new HttpError(404,'素材不存在。','media-missing');
  const parts=results.map(r=>new Uint8Array(r.bytes)),all=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;
  for(const p of parts){all.set(p,offset);offset+=p.length}return all.slice(start-first*128*1024,end-first*128*1024+1);
 }
 async deleteBlob(id){await this.db.batch([this.db.prepare('DELETE FROM blob_parts WHERE id=?').bind(id),this.db.prepare('DELETE FROM blobs WHERE id=?').bind(id)])}
 async usage(owner){const r=await this.db.prepare('SELECT COALESCE(SUM(size),0) AS bytes,COUNT(*) AS count FROM blobs WHERE owner=?').bind(owner).first();return {...r,quotaBytes:20*1024*1024}}
}
const lifeArrays=['posts','messages','notifications','challenges'];
const lifeMaps=['people','assets','aiUsage','follows','blocks','bookmarks'];
export function decodeLife(rows){const out={};for(const k of lifeArrays)out[k]=[];for(const k of lifeMaps)out[k]=Object.create(null);for(const [id,body] of rows){const i=id.indexOf(':'),kind=id.slice(0,i),key=id.slice(i+1);if(lifeArrays.includes(kind))out[kind].push(JSON.parse(body));else if(lifeMaps.includes(kind))out[kind][key]=JSON.parse(body)}for(const k of lifeArrays)out[k].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));return out}
export function encodeLife(db){const rows=new Map();for(const kind of lifeArrays)for(const item of db[kind]||[])rows.set(kind+':'+item.id,JSON.stringify(item));for(const kind of lifeMaps)for(const [key,value] of Object.entries(db[kind]||{}))rows.set(kind+':'+key,JSON.stringify(value));return rows}
export async function lifeStorage(repo,owner,bucket){
 const snapshot=await repo.load('life');
 return {load:async()=>decodeLife(snapshot.rows),save:db=>repo.save(snapshot,encodeLife(db)),putAsset:(id,bytes,mime)=>repo.putBlob('life/'+id,owner,mime,new Uint8Array(bytes)),getAsset:async id=>{const meta=await repo.read('life','assets:'+id);if(meta?.storage==='r2'){if(!bucket||!meta.mime.startsWith('image/')||meta.size>20*1024*1024)throw new HttpError(413,'无法读取饮食照片。');const object=await bucket.get(meta.objectKey);if(!object)throw new HttpError(404,'素材不存在。');return new Uint8Array(await object.arrayBuffer())}return repo.getBlob('life/'+id)},deleteAsset:id=>repo.deleteBlob('life/'+id),readState:uid=>repo.read('state',uid),readWorkouts:async uid=>(await repo.read('state',uid))?.workouts||[],
 sendAsset:async(req,res,id,asset)=>{const r=await blobResponse(repo,'life/'+id,req.method,req.headers.range,asset);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(req.method==='HEAD'?null:Buffer.from(await r.arrayBuffer()))}}
}
export async function blobResponse(repo,id,method,range,meta){
 meta ||= await repo.blobMeta(id);if(!meta)throw new HttpError(404,'素材不存在。','media-missing');
 const h=new Headers({'Content-Type':meta.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Content-Security-Policy':"default-src 'none'; sandbox"});let start=0,end=meta.size-1,status=200;
 if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${meta.size}`}});if(!m[1])start=Math.max(0,meta.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]))}if(start>end||start>=meta.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${meta.size}`}});status=206;h.set('Content-Range',`bytes ${start}-${end}/${meta.size}`)}
 h.set('Content-Length',String(end-start+1));return new Response(method==='HEAD'?null:(status===206?await repo.getBlobRange(id,start,end):await repo.getBlob(id)),{status,headers:h});
}

// Media requests need only metadata and current visibility, not every meal/message in the site.
export async function lifestyleAsset(repo,viewer,id,request,bucket){
 // Authorize the object, both block directions and live post visibility together.
 const row=await repo.db.prepare(`WITH asset AS (SELECT body FROM documents WHERE scope='life' AND id=?)
 SELECT a.body FROM asset a WHERE json_extract(a.body,'$.owner')=? OR (
 NOT EXISTS(SELECT 1 FROM documents b,json_each(b.body) x WHERE b.scope='life' AND ((b.id=? AND x.value=json_extract(a.body,'$.owner')) OR (b.id='blocks:'||json_extract(a.body,'$.owner') AND x.value=?)))
 AND EXISTS(SELECT 1 FROM documents p WHERE p.scope='life' AND p.id LIKE 'posts:%' AND COALESCE(json_extract(p.body,'$.deleted'),0)=0 AND (EXISTS(SELECT 1 FROM json_each(p.body,'$.media') WHERE value=?) OR json_extract(p.body,'$.music.assetId')=? OR json_extract(p.body,'$.poster')=?)))`).bind('assets:'+id,viewer,'blocks:'+viewer,viewer,id,id,id).first();
 if(!row)throw new HttpError(404,'素材不存在或无权访问。');const meta=JSON.parse(row.body);
 return meta.storage==='r2'?r2Response(bucket,meta,request):blobResponse(repo,'life/'+id,request.method,request.headers.get('range'),meta);
}

// Counts only, never return private message text or profiles for global badges.
export async function unreadSummary(repo,viewer){
 const row=await repo.db.prepare(`WITH incoming AS (
 SELECT body,CASE WHEN id LIKE 'messages:%' THEN 'message' ELSE 'interaction' END AS kind FROM documents
 WHERE scope='life' AND json_extract(body,'$.to')=? AND json_extract(body,'$.readAt') IS NULL
 AND (id LIKE 'messages:%' OR (id LIKE 'notifications:%' AND json_extract(body,'$.kind')!='message' AND (json_extract(body,'$.post') IS NULL OR EXISTS(SELECT 1 FROM documents p WHERE p.scope='life' AND p.id='posts:'||json_extract(documents.body,'$.post') AND COALESCE(json_extract(p.body,'$.deleted'),0)=0))))
 ) SELECT COALESCE(SUM(CASE WHEN n.kind='message' THEN 1 ELSE 0 END),0) AS messages,COALESCE(SUM(CASE WHEN n.kind='interaction' THEN 1 ELSE 0 END),0) AS interactions,
 (SELECT json_extract(body,'$.notificationPrefs.muted') FROM documents WHERE scope='life' AND id=?) AS muted FROM incoming n
 WHERE NOT EXISTS(SELECT 1 FROM documents b,json_each(b.body) x WHERE b.scope='life' AND ((b.id=? AND x.value=json_extract(n.body,'$.from')) OR (b.id='blocks:'||json_extract(n.body,'$.from') AND x.value=?)))`).bind(viewer,'people:'+viewer,'blocks:'+viewer,viewer).first();
 const messages=row?.muted?0:Number(row?.messages)||0,interactions=row?.muted?0:Number(row?.interactions)||0;return {total:messages+interactions,messages,interactions};
}
