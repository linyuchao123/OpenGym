// Lossless progressive MP4/MOV layout. Only headers + moov are read; mdat stays a Blob slice.
const type=(b,o)=>String.fromCharCode(...b.subarray(o,o+4))
const containers=new Set(['moov','trak','mdia','minf','stbl','edts','dinf','udta'])
export async function fastStartVideo(file){
 try{
  const boxes=[];let offset=0
  while(offset+8<=file.size&&boxes.length<256){const b=new Uint8Array(await file.slice(offset,offset+16).arrayBuffer()),v=new DataView(b.buffer);let size=v.getUint32(0),header=8;if(size===1){size=Number(v.getBigUint64(8));header=16}if(size===0)size=file.size-offset;if(!Number.isSafeInteger(size)||size<header||offset+size>file.size)return file;boxes.push({type:type(b,4),offset,size,header});offset+=size}
  const moov=boxes.find(b=>b.type==='moov'),mdat=boxes.find(b=>b.type==='mdat'),ftyp=boxes[0]
  if(!moov||!mdat||ftyp?.type!=='ftyp'||moov.offset<mdat.offset||moov.size>8*1048576||boxes.some(b=>['moof','sidx'].includes(b.type)))return file
  const bytes=new Uint8Array(await file.slice(moov.offset,moov.offset+moov.size).arrayBuffer()),dv=new DataView(bytes.buffer);let patched=0,unsupported=false
  const walk=(start,end)=>{for(let at=start;at+8<=end;){let size=dv.getUint32(at),h=8;if(size===1){size=Number(dv.getBigUint64(at+8));h=16}if(!size)size=end-at;if(size<h||at+size>end)throw Error('Invalid MP4 box');const kind=type(bytes,at+4);if(kind==='mvex'||kind==='cmov')unsupported=true
   if(kind==='stco'||kind==='co64'){const count=dv.getUint32(at+h+4),stride=kind==='stco'?4:8;if(at+h+8+count*stride>at+size)throw Error('Bad MP4 offsets');for(let i=0;i<count;i++){const p=at+h+8+i*stride,old=kind==='stco'?dv.getUint32(p):Number(dv.getBigUint64(p)),next=old>=ftyp.size&&old<moov.offset?old+moov.size:old;if(!Number.isSafeInteger(next)||kind==='stco'&&next>4294967295)throw Error('Offset overflow');if(kind==='stco')dv.setUint32(p,next);else dv.setBigUint64(p,BigInt(next));patched++}}
   else if(containers.has(kind))walk(at+h,at+size);at+=size}}
  walk(moov.header,bytes.length);if(unsupported||!patched)return file
  return new Blob([file.slice(0,ftyp.size),bytes,file.slice(ftyp.size,moov.offset),file.slice(moov.offset+moov.size)],{type:file.type})
 }catch{return file}
}
export async function videoPoster(file){
 const url=URL.createObjectURL(file),v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';let timer
 try{await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('poster timeout')),8000);v.onerror=()=>reject(Error('video format'));v.onloadeddata=()=>{v.currentTime=Math.min(.1,Number.isFinite(v.duration)?v.duration/2:.1)};v.onseeked=resolve;v.src=url});const c=document.createElement('canvas'),scale=Math.min(1,480/Math.max(v.videoWidth,v.videoHeight));c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);c.getContext('2d').drawImage(v,0,0,c.width,c.height);return await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.7))}catch{return null}finally{clearTimeout(timer);v.pause();v.removeAttribute('src');v.load();URL.revokeObjectURL(url)}
}
