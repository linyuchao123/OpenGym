import {api} from './api.js'
import {sha256Hex} from './sha256.js'
export const PART_SIZE=5*1024*1024
const paused=()=>new DOMException('上传已暂停','AbortError')
// Hash and send bounded slices: never materialise a whole video in JavaScript memory.
export async function uploadMultipart(file,{onProgress=()=>{},signal,name=file.name||'素材',isCurrent=()=>true,request=api,hash=sha256Hex}={}){
 const ctl=new AbortController(),abort=()=>ctl.abort();signal?.addEventListener('abort',abort,{once:true})
 const check=()=>{if(signal?.aborted||ctl.signal.aborted||!isCurrent()){ctl.abort();throw paused()}}
 const progress=(stage,bytes)=>{check();onProgress({stage,bytes,total:file.size,name,percent:Math.round(bytes/file.size*100)})}
 const call=async(path,opts={})=>{
  for(let attempt=0;;attempt++){
   check()
   try{const result=await request(path,{...opts,signal:ctl.signal,timeout:180000});check();return result}
   catch(e){check();if(attempt>=2||(![0,409,429,502,503,504].includes(e.status)&&e.status!=null))throw e
    await new Promise((resolve,reject)=>{const stop=()=>{clearTimeout(timer);reject(paused())};const timer=setTimeout(()=>{ctl.signal.removeEventListener('abort',stop);resolve()},Math.min(30000,(e.status===429?10000:700)*2**attempt));ctl.signal.addEventListener('abort',stop,{once:true});if(ctl.signal.aborted)stop()})
   }
  }
 }
 try{
  if(!file.size)throw Error('请选择非空文件。')
  const max=file.type.startsWith('video/')?200*1024*1024:file.type.startsWith('image/')?20*1024*1024:2*1024*1024
  if(file.size>max)throw Error('视频最多200 MB，照片最多20 MB，MP3最多2 MB。')
  const hashes=[];progress('校验',0)
  for(let offset=0;offset<file.size;offset+=PART_SIZE){check();hashes.push(await hash(file.slice(offset,offset+PART_SIZE)));progress('校验',Math.min(file.size,offset+PART_SIZE))}
  const fingerprint=await hash(new TextEncoder().encode(`${file.type}:${file.size}:${hashes.join(',')}`));check()
  const session=await call('/api/uploads/init',{method:'POST',body:JSON.stringify({name,mime:file.type,size:file.size,hashes,fingerprint})})
  if(session.complete){progress('完成',file.size);return {id:session.id,mime:file.type,size:file.size}}
  if(session.partSize!==PART_SIZE)throw Error('上传配置已更新，请刷新页面后再试。')
  const done=new Set(session.uploadedParts.map(p=>p.number));let bytes=session.uploadedParts.reduce((sum,p)=>sum+p.size,0),cursor=0
  progress('上传',bytes)
  const send=async()=>{for(;;){check();const i=cursor++;if(i>=hashes.length)return;if(done.has(i+1))continue
   const part=file.slice(i*PART_SIZE,(i+1)*PART_SIZE)
   await call(`/api/uploads/${session.id}/parts/${i+1}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:part})
   bytes+=part.size;progress('上传',bytes)
  }}
  // At most two in-flight chunks, including on slow mobile connections.
  await Promise.all([send(),send()]);progress('正在保存',file.size)
  const result=await call(`/api/uploads/${session.id}/complete`,{method:'POST',body:'{}'});progress('完成',file.size);return result
 }finally{ctl.abort();signal?.removeEventListener('abort',abort)}
}
