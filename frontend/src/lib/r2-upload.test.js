import {it,expect,vi} from 'vitest'
import {uploadMultipart,PART_SIZE} from './r2-upload.js'
const file=(size=PART_SIZE+10)=>{const f=new Blob([new Uint8Array(size)],{type:'video/mp4'});f.arrayBuffer=()=>{throw Error('Whole video must never be buffered')};return f}
const hash=async b=>b instanceof Blob?'a'.repeat(64):'b'.repeat(64)
it('resumes confirmed chunks and never buffers the full video',async()=>{
 const request=vi.fn(async p=>p.endsWith('/init')?{id:'u',partSize:PART_SIZE,uploadedParts:[{number:1,size:PART_SIZE,etag:'a'}]}:p.endsWith('/complete')?{id:'u',size:PART_SIZE+10}:{etag:'b'}),progress=vi.fn()
 const r=await uploadMultipart(file(),{request,hash,onProgress:progress});expect(r.id).toBe('u');expect(request.mock.calls.filter(([p])=>p.includes('/parts/'))).toHaveLength(1);expect(request.mock.calls.find(([p])=>p.includes('/parts/'))[1].body.size).toBe(10);expect(progress.mock.calls.at(-1)[0].stage).toBe('完成')
})
it('lost completion reply retries the same upload instead of making a duplicate',async()=>{
 let attempts=0;const request=vi.fn(async p=>{if(p.endsWith('/init'))return {id:'u',partSize:PART_SIZE,uploadedParts:[]};if(p.endsWith('/complete')&&attempts++===0)throw Object.assign(Error('offline'),{status:0});return {id:'u'}})
 await uploadMultipart(file(10),{request,hash});expect(request.mock.calls.filter(([p])=>p.endsWith('/complete'))).toHaveLength(2);expect(request.mock.calls.filter(([p])=>p.endsWith('/init'))).toHaveLength(1)
})
it('pause aborts requests and preserves server chunks for a later resume',async()=>{
 const ctl=new AbortController(),request=vi.fn(async()=>{ctl.abort();throw new DOMException('pause','AbortError')})
 await expect(uploadMultipart(file(10),{request,hash,signal:ctl.signal})).rejects.toMatchObject({name:'AbortError'});expect(request).toHaveBeenCalledOnce();expect(request.mock.calls[0][1].signal.aborted).toBe(true)
})
it('account switch prevents finalization under a different identity',async()=>{
 let current=true;const request=vi.fn(async()=>{current=false;return {id:'u',complete:true}})
 await expect(uploadMultipart(file(10),{request,hash,isCurrent:()=>current})).rejects.toMatchObject({name:'AbortError'});expect(request).toHaveBeenCalledOnce()
})
it('over-limit video is rejected before hashing or reserving space',async()=>{
 const request=vi.fn();await expect(uploadMultipart({size:209715201,type:'video/mp4'},{request,hash})).rejects.toThrow('200 MB');expect(request).not.toHaveBeenCalled()
})
