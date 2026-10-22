// Private session-only caches. Never put authenticated photos into the public service worker.
let owner=null,epoch=0
export const feeds=new Map()
export const feedPreferences=new Map()
const images=new Map(),pending=new Map(),listeners=new Set()
const downloads=new Set()
let bytes=0
export function cacheOwner(id){if(owner!==id){owner=id;clearCommunity()}}
export function clearCommunity(){epoch++;for(const ctl of downloads)ctl.abort();downloads.clear();feeds.clear();feedPreferences.clear();for(const item of images.values())URL.revokeObjectURL(item.url);images.clear();pending.clear();bytes=0;for(const notify of listeners)notify()}
export function onCommunityClear(fn){listeners.add(fn);return()=>listeners.delete(fn)}
export function cachedImage(id){const item=images.get(id);if(!item)return null;if(Date.now()-item.at>300000){images.delete(id);bytes-=item.size;URL.revokeObjectURL(item.url);return null}images.delete(id);images.set(id,item);return item.url}
export function loadCommunityImage(id,url,priority=false){
 const hit=cachedImage(id);if(hit)return Promise.resolve(hit)
 if(pending.has(id))return pending.get(id)
 const generation=epoch,ctl=new AbortController();downloads.add(ctl);const timer=setTimeout(()=>ctl.abort(),20000)
 const promise=fetch(url,{signal:ctl.signal,credentials:'same-origin',cache:'no-store',priority:priority?'high':'low'}).then(async r=>{if(!r.ok||!r.headers.get('content-type')?.startsWith('image/'))throw new Error('图片暂时无法加载');const blob=await r.blob();if(generation!==epoch)throw new Error('账号已切换');
  if(blob.size>12*1024*1024)throw new Error('图片过大');const entry={url:URL.createObjectURL(blob),size:blob.size,at:Date.now()};images.set(id,entry);bytes+=entry.size;
  while(images.size>20||bytes>12*1024*1024){const [key,item]=images.entries().next().value;images.delete(key);bytes-=item.size;URL.revokeObjectURL(item.url)}return entry.url
 }).finally(()=>{clearTimeout(timer);downloads.delete(ctl);if(generation===epoch)pending.delete(id)})
 pending.set(id,promise);return promise
}
