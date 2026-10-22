import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exerciseClip} from '../src/exercise-media.js';
const bytes = new Uint8Array(20).map((_,i)=>i);
const url = 'https://gym.example/exercise-media/clip/10818.mp4';
const assets = {async fetch(req){
  assert.equal(req.headers.get('range'), null);
  return new Response(req.method === 'HEAD' ? null : bytes, {headers:{'Content-Type':'video/mp4','Content-Length':'20',ETag:'"clip"'}});
}};
test('Safari probe, bounded, open-ended, suffix and clamped ranges return exact bytes', async()=>{
  for(const [range,start,end] of [['bytes=0-1',0,1],['bytes=3-8',3,8],['bytes=15-',15,19],['bytes=-3',17,19],['bytes=18-100',18,19]]){
    const r=await exerciseClip(new Request(url,{headers:{Range:range}}),assets);
    assert.equal(r.status,206);
    assert.equal(r.headers.get('content-range'),`bytes ${start}-${end}/20`);
    assert.equal(r.headers.get('content-length'),String(end-start+1));
    assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes.slice(start,end+1));
  }
});
test('unsatisfiable ranges return 416; unsupported ranges and stale If-Range return full content',async()=>{
  for(const range of ['bytes=20-','bytes=4-2','bytes=-0'])assert.equal((await exerciseClip(new Request(url,{headers:{Range:range}}),assets)).status,416);
  for(const headers of [{Range:'bytes=0-1,3-4'},{Range:'bytes=0-1','If-Range':'"old"'},{}]){
    const r=await exerciseClip(new Request(url,{headers}),assets);assert.equal(r.status,200);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);
  }
});
test('HEAD advertises ranges without body, missing clips never return the SPA document',async()=>{
  const head=await exerciseClip(new Request(url,{method:'HEAD'}),assets);assert.equal(head.headers.get('accept-ranges'),'bytes');assert.equal(head.headers.get('content-length'),'20');assert.equal(await head.text(),'');
  assert.equal((await exerciseClip(new Request(url),{fetch:async()=>new Response('<html>app</html>',{headers:{'Content-Type':'text/html'}})})).status,404);
  assert.equal((await exerciseClip(new Request(url.replace('10818','missing')),assets)).status,404);
});
test('curated music supports Safari byte probes and rejects unknown tracks',async()=>{
 const musicAssets={fetch:async()=>new Response(bytes,{headers:{'Content-Type':'audio/mpeg','Content-Length':'20'}})};
 const r=await exerciseClip(new Request('https://gym.example/music/momentum.mp3',{headers:{Range:'bytes=0-1'}}),musicAssets,{music:true});assert.equal(r.status,206);assert.equal(r.headers.get('content-type'),'audio/mpeg');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes.slice(0,2));
 assert.equal((await exerciseClip(new Request('https://gym.example/music/unknown.mp3'),musicAssets,{music:true})).status,404);
});
