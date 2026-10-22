import {HttpError} from './repository.js';
export const PART_SIZE=5*1024*1024;
export const USER_LIMIT=1024**3,SITE_LIMIT=8*1024**3;
const DAY=86400000;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export const mediaLimit=m=>m.startsWith('video/')?200*1024*1024:m.startsWith('image/')?20*1024*1024:2*1024*1024;
export function validMedia(b,m){
 if(m==='image/jpeg')return b[0]===255&&b[1]===216&&b[2]===255;
 if(m==='image/png')return Buffer.from(b.slice(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(m==='image/webp')return Buffer.from(b.slice(0,4)).toString()==='RIFF'&&Buffer.from(b.slice(8,12)).toString()==='WEBP';
 if(m==='audio/mpeg')return Buffer.from(b.slice(0,3)).toString()==='ID3'||(b[0]===255&&(b[1]&224)===224);
 return ['video/mp4','video/quicktime'].includes(m)&&Buffer.from(b.slice(4,8)).toString()==='ftyp';
}
const digest=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
const supported=['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','audio/mpeg'];
export async function uploadUsage(repo,owner){
 const q=await repo.db.prepare(`SELECT COALESCE(SUM(size),0) AS bytes,
 COALESCE(SUM(CASE WHEN owner=? THEN size ELSE 0 END),0) AS own,
 COALESCE(SUM(CASE WHEN owner=? AND status!='ready' THEN size ELSE 0 END),0) AS reserved
 FROM (SELECT owner,size,'ready' AS status FROM blobs UNION ALL SELECT owner,size,status FROM media_uploads WHERE status NOT IN ('aborted','deleted'))`).bind(owner,owner).first();
 const {results:pending}=await repo.db.prepare("SELECT id,name,size,status,expires FROM media_uploads WHERE owner=? AND status NOT IN ('ready','aborted','deleted') ORDER BY created DESC LIMIT 20").bind(owner).all();
 return {bytes:q.own,reservedBytes:q.reserved,quotaBytes:USER_LIMIT,siteBytes:q.bytes,siteQuotaBytes:SITE_LIMIT,pending};
}
async function manifest(repo,row){
 const {results}=await repo.db.prepare('SELECT number,etag,size FROM media_upload_parts WHERE upload=? ORDER BY number').bind(row.id).all();
 return {id:row.id,mime:row.mime,size:row.size,complete:row.status==='ready',status:row.status,partSize:PART_SIZE,uploadedParts:results,expiresAt:row.expires};
}
async function abortRow(repo,bucket,row){
 // Never release the reservation before R2 confirms cleanup. A failed cleanup is retryable.
 await repo.db.prepare("UPDATE media_uploads SET status='aborting' WHERE id=? AND status NOT IN ('ready','aborted','deleted')").bind(row.id).run();
 const current=await repo.db.prepare('SELECT * FROM media_uploads WHERE id=?').bind(row.id).first();
 if(!current||['ready','aborted','deleted'].includes(current.status))return;
 if(current.upload_id){try{await bucket.resumeMultipartUpload(current.object_key,current.upload_id).abort()}catch(e){if(!/not found|does not exist|NoSuchUpload|10024/i.test(String(e)))throw e;}}
 await bucket.delete(current.object_key);
 await repo.db.batch([repo.db.prepare("UPDATE media_uploads SET status='aborted' WHERE id=? AND status='aborting'").bind(row.id),repo.db.prepare('DELETE FROM media_upload_parts WHERE upload=?').bind(row.id)]);
}
export async function cleanupUploads(repo,bucket,limit=10){
 if(!bucket)return;
 const {results}=await repo.db.prepare("SELECT * FROM media_uploads WHERE status NOT IN ('ready','aborted','deleted') AND expires<? ORDER BY expires LIMIT ?").bind(Date.now(),limit).all();
 for(const row of results){try{await abortRow(repo,bucket,row)}catch{console.error('R2 abandoned upload cleanup deferred',row.id)}}
}
export async function r2UploadRoute(request,repo,bucket,user,body,boundedBody){
 const url=new URL(request.url),path=url.pathname;
 if(!bucket)throw new HttpError(503,'视频存储尚未配置。');
 if(request.method==='GET'&&path==='/api/uploads/usage')return json(await uploadUsage(repo,user.id));
 if(request.method==='POST'&&path==='/api/uploads/init'){
  const {mime,size,hashes,fingerprint}=body;
  if(!supported.includes(mime)||!Number.isSafeInteger(size)||size<1||size>mediaLimit(mime))throw new HttpError(413,'视频最多200 MB、照片最多20 MB、MP3最多2 MB。');
  if(!Array.isArray(hashes)||hashes.length!==Math.ceil(size/PART_SIZE)||!hashes.every(h=>/^[a-f0-9]{64}$/.test(h)))throw new HttpError(400,'素材分片校验信息无效。');
  if(fingerprint!==await digest(new TextEncoder().encode(`${mime}:${size}:${hashes.join(',')}`)))throw new HttpError(400,'素材标识校验失败。');
  const previous=await repo.db.prepare("SELECT * FROM media_uploads WHERE owner=? AND fingerprint=? AND status NOT IN ('aborted','deleted')").bind(user.id,fingerprint).first();
  if(previous){if(previous.status==='ready'||(previous.upload_id&&previous.expires>Date.now()&&previous.status==='uploading'))return json(await manifest(repo,previous));if(previous.expires<Date.now())await abortRow(repo,bucket,previous);else throw new HttpError(409,'上传正在初始化或完成，请稍后重试。');}
  const id=crypto.randomUUID(),objectKey=`life/${user.id}/${id}`,now=Date.now();
  try{await repo.db.prepare("INSERT INTO media_uploads(id,owner,fingerprint,name,mime,size,object_key,hashes,status,created,expires) VALUES(?,?,?,?,?,?,?,?,'pending',?,?)").bind(id,user.id,fingerprint,String(body.name||'素材').slice(0,100),mime,size,objectKey,JSON.stringify(hashes),now,now+DAY).run()}
  catch(e){if(/media-full/.test(String(e)))throw new HttpError(413,'素材容量已满：每人1 GB、本站8 GB，待上传文件也占用容量。');if(/UNIQUE/.test(String(e)))throw new HttpError(409,'同一素材正在初始化，请重试。');throw e}
  let upload;
  try{
   upload=await bucket.createMultipartUpload(objectKey,{httpMetadata:{contentType:mime},customMetadata:{owner:user.id,fingerprint},storageClass:'Standard'});
   await repo.db.prepare("UPDATE media_uploads SET upload_id=?,status='uploading' WHERE id=? AND status='pending'").bind(upload.uploadId,id).run();
  }catch(e){if(upload){try{await upload.abort()}catch{throw e}}await repo.db.prepare("UPDATE media_uploads SET status='aborted' WHERE id=? AND status='pending'").bind(id).run();throw e}
  return json(await manifest(repo,await repo.db.prepare('SELECT * FROM media_uploads WHERE id=?').bind(id).first()),201);
 }
 const match=/^\/api\/uploads\/([\w-]{1,80})(?:\/(parts\/([1-9]\d*)|complete))?$/.exec(path);
 if(!match)throw new HttpError(404,'上传接口不存在。');
 const row=await repo.db.prepare('SELECT * FROM media_uploads WHERE id=? AND owner=?').bind(match[1],user.id).first();
 if(!row)throw new HttpError(404,'上传记录不存在。');
 if(request.method==='GET'&&!match[2])return json(await manifest(repo,row));
 if(request.method==='DELETE'&&!match[2]){
  if(row.status==='ready')throw new HttpError(409,'素材已上传完成，不能当作未完成上传清理。');
  if(row.status==='finalizing'&&row.expires>Date.now())throw new HttpError(409,'素材正在完成，请稍后再试。');
  await abortRow(repo,bucket,row);return json({ok:true});
 }
 if(request.method==='POST'&&match[2]==='complete'){
  if(row.status==='ready')return json({id:row.id,mime:row.mime,size:row.size});
  if(!['uploading','finalizing'].includes(row.status)||row.expires<Date.now())throw new HttpError(409,'上传已暂停清理或已过期，请重新选择文件。');
  const parts=(await manifest(repo,row)).uploadedParts,hashes=JSON.parse(row.hashes);
  if(parts.length!==hashes.length||parts.some((p,i)=>p.number!==i+1))throw new HttpError(409,'还有分片未上传完成。');
  if(row.status==='uploading'){const lock=await repo.db.prepare("UPDATE media_uploads SET status='finalizing' WHERE id=? AND status='uploading'").bind(row.id).run();
   if(!lock.meta.changes)throw new HttpError(409,'素材正在完成，请稍后重试。');
  }
  let object=await bucket.head(row.object_key);
  if(!object){
   if(row.status==='finalizing')throw new HttpError(409,'素材正在完成，请稍后重试。');
   try{object=await bucket.resumeMultipartUpload(row.object_key,row.upload_id).complete(parts.map(p=>({partNumber:p.number,etag:p.etag})))}
   catch(e){object=await bucket.head(row.object_key);if(!object){await repo.db.prepare("UPDATE media_uploads SET status='uploading' WHERE id=? AND status='finalizing'").bind(row.id).run();throw e}}
  }
  if(object.size!==row.size||object.customMetadata?.fingerprint!==row.fingerprint||object.customMetadata?.owner!==user.id)throw new HttpError(409,'上传文件校验不一致，请清理后重新上传。');
  const finalizedAt=Date.now();
  const asset={owner:user.id,mime:row.mime,size:row.size,createdAt:row.created,storage:'r2',objectKey:row.object_key,etag:object.httpEtag};
  await repo.db.batch([
   repo.db.prepare("INSERT INTO documents(scope,id,body) SELECT 'life',?,? WHERE EXISTS(SELECT 1 FROM media_uploads WHERE id=? AND status='finalizing' AND expires>?) ON CONFLICT(scope,id) DO NOTHING").bind('assets:'+row.id,JSON.stringify(asset),row.id,finalizedAt),
   repo.db.prepare("UPDATE media_uploads SET status='ready',expires=0 WHERE id=? AND status='finalizing' AND expires>?").bind(row.id,finalizedAt),
   repo.db.prepare("INSERT INTO versions(scope,rev) VALUES('life',1) ON CONFLICT(scope) DO UPDATE SET rev=rev+1")
  ]);
  const saved=await repo.db.prepare('SELECT status FROM media_uploads WHERE id=?').bind(row.id).first();
  if(saved.status!=='ready')throw new HttpError(409,'上传已过期，请重新选择文件。');
  return json({id:row.id,mime:row.mime,size:row.size});
 }
 if(request.method==='PUT'&&match[3]){
  if(row.status!=='uploading'||row.expires<Date.now())throw new HttpError(409,'上传已结束或过期，请重新选择同一文件。');
  const n=Number(match[3]),hashes=JSON.parse(row.hashes),expected=Math.min(PART_SIZE,row.size-(n-1)*PART_SIZE);
  if(n<1||n>hashes.length)throw new HttpError(400,'分片编号无效。');
  const bytes=await boundedBody(request,expected);
  if(bytes.length!==expected||await digest(bytes)!==hashes[n-1])throw new HttpError(400,'分片校验失败，请重试。');
  if(n===1&&!validMedia(bytes,row.mime))throw new HttpError(400,'素材内容与文件格式不匹配。');
  const old=await repo.db.prepare('SELECT etag FROM media_upload_parts WHERE upload=? AND number=?').bind(row.id,n).first();
  if(old)return json({partNumber:n,etag:old.etag});
  const part=await bucket.resumeMultipartUpload(row.object_key,row.upload_id).uploadPart(n,bytes);
  const saved=await repo.db.prepare("INSERT INTO media_upload_parts(upload,number,etag,size) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM media_uploads WHERE id=? AND status='uploading' AND expires>?) ON CONFLICT(upload,number) DO UPDATE SET etag=excluded.etag").bind(row.id,n,part.etag,expected,row.id,Date.now()).run();
  if(!saved.meta.changes)throw new HttpError(409,'上传已暂停清理，请重新选择文件。');
  return json({partNumber:n,etag:part.etag});
 }
 throw new HttpError(405,'不支持此上传操作。');
}
export async function r2Response(bucket,meta,request){
 if(!bucket)throw new HttpError(503,'素材存储暂不可用。');
 let start=0,end=meta.size-1,status=200;
 const range=request.headers.get('range'),ifRange=request.headers.get('if-range');
 if(range&&(!ifRange||ifRange===meta.etag)){
  const m=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${meta.size}`}});
  if(!m[1])start=Math.max(0,meta.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(Number(m[2]),end)}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=meta.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${meta.size}`}});
  status=206;
 }
 const object=request.method==='HEAD'?await bucket.head(meta.objectKey):await bucket.get(meta.objectKey,status===206?{range:{offset:start,length:end-start+1}}:undefined);
 if(!object)throw new HttpError(404,'素材不存在。');
 const headers={'Content-Type':meta.mime,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",ETag:object.httpEtag};
 if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${meta.size}`;
 return new Response(request.method==='HEAD'?null:object.body,{status,headers});
}
