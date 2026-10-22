import {it,expect} from 'vitest'
import fs from 'node:fs'
import {fastStartVideo} from './video-faststart.js'
const source=fs.readFileSync(new URL('../../../api/test/fixtures/lifestyle-video-tail.mp4',import.meta.url)),type=(b,o)=>b.toString('ascii',o+4,o+8)
const boxes=b=>{const out=[];for(let i=0;i+8<=b.length;){const n=b.readUInt32BE(i)||b.length-i;out.push({type:type(b,i),offset:i,size:n,bytes:b.subarray(i,i+n)});i+=n}return out}
it('losslessly moves tail metadata ahead of media and keeps file size/media bytes unchanged',async()=>{const f=new Blob([source],{type:'video/mp4'});f.arrayBuffer=()=>{throw Error('Do not buffer a whole video')};const result=await fastStartVideo(f),bytes=Buffer.from(await result.arrayBuffer()),before=boxes(source),after=boxes(bytes);expect(after.findIndex(b=>b.type==='moov')).toBeLessThan(after.findIndex(b=>b.type==='mdat'));expect(result.size).toBe(source.length);expect(after.find(b=>b.type==='mdat').bytes).toEqual(before.find(b=>b.type==='mdat').bytes)})
it('already progressive or unsupported videos are preserved untouched',async()=>{const f=new Blob([fs.readFileSync(new URL('../../../api/test/fixtures/lifestyle-video.mp4',import.meta.url))],{type:'video/mp4'});expect(await fastStartVideo(f)).toBe(f);const invalid=new Blob(['invalid'],{type:'video/quicktime'});expect(await fastStartVideo(invalid)).toBe(invalid)})
