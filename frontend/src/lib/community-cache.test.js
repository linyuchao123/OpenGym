// @vitest-environment happy-dom
import {it,expect,vi,afterEach} from 'vitest'
import {cacheOwner,clearCommunity,loadCommunityImage,cachedImage,feeds} from './community-cache.js'
afterEach(()=>{clearCommunity();vi.restoreAllMocks()})
it('deduplicates image downloads and never persists across account changes',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:private');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(new Blob(['photo'],{type:'image/jpeg'}),{headers:{'content-type':'image/jpeg'}}));cacheOwner('a');
 expect(await loadCommunityImage('x','/api/life/asset?id=x')).toBe('blob:private');expect(await loadCommunityImage('x','/api/life/asset?id=x')).toBe('blob:private');expect(fetcher).toHaveBeenCalledTimes(1);feeds.set('a',{posts:[1]});cacheOwner('b');expect(cachedImage('x')).toBeNull();expect(feeds.size).toBe(0);expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private')
})
it('rejects unauthorized responses and discards requests finishing after logout',async()=>{
 let done;vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(r=>{done=r}));cacheOwner('a');const pending=loadCommunityImage('x','/api/photo');cacheOwner(null);done(new Response('image',{headers:{'content-type':'image/jpeg'}}));await expect(pending).rejects.toThrow('账号已切换');expect(cachedImage('x')).toBeNull();
 fetch.mockResolvedValue(new Response('no',{status:403}));await expect(loadCommunityImage('x','/api/photo')).rejects.toThrow()
})
it('expires at five minutes and evicts least recently used images beyond twenty',async()=>{
 vi.spyOn(URL,'createObjectURL').mockImplementation(()=>Math.random()+'');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response('photo',{headers:{'content-type':'image/jpeg'}}));cacheOwner('a');for(let i=0;i<21;i++)await loadCommunityImage('p'+i,'/api/photo');expect(cachedImage('p0')).toBeNull();expect(cachedImage('p20')).toBeTruthy();vi.spyOn(Date,'now').mockReturnValue(Date.now()+300001);expect(cachedImage('p20')).toBeNull()
})
it('evicts old content when total image bytes exceed twelve MiB',async()=>{vi.spyOn(URL,'createObjectURL').mockImplementation(()=>Math.random()+'');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(new Blob([new Uint8Array(7*1024*1024)]),{headers:{'content-type':'image/jpeg'}}));cacheOwner('large');await loadCommunityImage('large-a','/api/photo');await loadCommunityImage('large-b','/api/photo');expect(cachedImage('large-a')).toBeNull();expect(cachedImage('large-b')).toBeTruthy()})
