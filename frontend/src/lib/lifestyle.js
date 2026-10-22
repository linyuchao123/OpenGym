import {useStore} from '../store/useStore.js'
import {uploadMultipart} from './r2-upload.js'
import { create } from 'zustand'
import {readLifeCache,changeLifeCache} from './lifestyle-cache.js'
import { api, appBase } from './api.js'

const empty = () => ({ profile: {}, profileBackup:null, meals: [], templates: [], ai: { configured: false } })
let guestQueue = Promise.resolve(),profileQueue=Promise.resolve()
async function guestDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('gym_lifestyle_v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('records')
    request.onerror = () => reject(new Error('浏览器无法保存记录，请退出隐私浏览模式或登录账号。'))
    request.onsuccess = () => resolve(request.result)
  })
}
async function guestRead() {
  const db = await guestDB()
  try { return await new Promise((resolve, reject) => { const tx = db.transaction('records'); const r = tx.objectStore('records').get('guest'); r.onsuccess = () => resolve(r.result || empty()); r.onerror = () => reject(r.error) }) }
  finally { db.close() }
}
async function guestWrite(value) {
  const db = await guestDB()
  try { await new Promise((resolve, reject) => { const tx = db.transaction('records', 'readwrite'); tx.objectStore('records').put(value, 'guest'); tx.oncomplete = resolve; tx.onerror = () => reject(new Error('浏览器存储空间不足，记录没有保存，请导出备份。')); tx.onabort = tx.onerror }) }
  finally { db.close() }
}
export const useLifestyle = create((set, get) => ({
  owner: null, ...empty(), loadedOwner:null,profileSaving:false,profileSequence:0, loading: false, error: '', pendingMeals:[],syncingMeals:false,cacheError:'',lastSavedAt:null,
  async flushMeals(){
    const owner=get().owner;if(!owner||owner==='guest'||get().syncingMeals||!get().pendingMeals.length||navigator.onLine===false)return;
    set({syncingMeals:true});
    try{let cache=await readLifeCache(owner);
      for(const item of cache?.pendingMeals||[]){if(get().owner!==owner)return;
        const body={...item,id:item._serverId||undefined,baseUpdatedAt:item._baseUpdatedAt||undefined};
        const {meal}=await api('/api/life/meal',{method:'POST',body:JSON.stringify(body)});
        if(get().owner!==owner)return;
        cache=await changeLifeCache(owner,c=>{const current=c.pendingMeals.find(x=>x.id===item.id);const same=current?current._rev===item._rev:true;
          const pending=c.pendingMeals.filter(x=>x.id!==item.id);if(!same)pending.push({...current,id:meal.id,_serverId:meal.id,_baseUpdatedAt:meal.updatedAt});
          return {...c,pendingMeals:pending,meals:[...c.meals.filter(x=>x.id!==item.id&&x.id!==meal.id),...(same?[meal]:[{...current,id:meal.id,_serverId:meal.id,_baseUpdatedAt:meal.updatedAt}])]};});
        if(get().owner===owner)set({meals:cache.meals,pendingMeals:cache.pendingMeals,lastSavedAt:Date.now(),error:''});
      }
    }catch(e){if(get().owner===owner)set({error:e.status===409?'饮食记录存在同步冲突，待同步内容仍在本机，请先备份并核对服务器记录。':e.message})}
    finally{if(get().owner===owner)set({syncingMeals:false})}
  },
  async load(user) {
    const owner = user?.id || 'guest'
    if (get().owner === owner && get().loading) return
    const sequence=get().profileSequence;
    const same=get().owner===owner;
    set({ owner, ...(!same?{...empty(),loadedOwner:null,profileSaving:false}:{}), loading: true, error: '',pendingMeals:[],syncingMeals:false,cacheError:'' })
    try {
      const data = owner === 'guest' ? await guestRead() : await api('/api/life/me')
      const currentProfile=()=>get().profileSequence!==sequence||Number(get().profile.version??get().profile.updatedAt??0)>Number(data.profile?.version??data.profile?.updatedAt??0)?get().profile:data.profile
      data.profile=currentProfile()
      if(get().owner!==owner)return;
      if(owner==='guest'){set({...data,loading:false,loadedOwner:owner});return}
      let cache;try{cache=await changeLifeCache(owner,c=>({...data,profile:currentProfile(),profileBackup:c.profileBackup||c.profile,pendingMeals:c.pendingMeals||[],meals:[...data.meals.filter(m=>!(c.pendingMeals||[]).some(p=>p.id===m.id)),...(c.pendingMeals||[])]}))}catch{if(get().owner===owner)set({cacheError:'服务器记录已加载，但本机缓存不可用，断网后请勿关闭尚未保存的编辑页。'})}
      if(get().owner===owner){set({...data,...(cache||{}),profile:currentProfile(),loadedOwner:owner,loading:false});get().flushMeals()}
    } catch (e) {let cache;if(owner!=='guest'&&(e.status===0||navigator.onLine===false)){try{cache=await readLifeCache(owner)}catch{}}if(get().owner===owner)set({...cache,error:cache?'离线缓存已加载，待同步记录保存在本机。':e.message,loading:false})}
  },
  async localChange(fn) {
    const owner = get().owner
    const operation = guestQueue.catch(() => {}).then(async () => {
      if (owner !== 'guest' || get().owner !== owner) throw new Error('账号已切换，请重试。')
      const next = structuredClone({ profile: get().profile, meals: get().meals, templates: get().templates || [], ai: get().ai })
      const value = fn(next)
      await guestWrite(next)
      if (get().owner === owner) set(next)
      return value
    })
    guestQueue = operation
    return operation
  },
  async saveProfile(profile) {
    const owner=get().owner;if(!owner)throw Error('请先登录并等待资料加载。');
    if(owner==='guest')return get().localChange(s=>{s.profile=profile});
    if(get().loading||get().loadedOwner!==owner)throw Error('个人资料尚未加载完成，请稍后再保存。');
    const operation=profileQueue.catch(()=>{}).then(async()=>{
      if(get().owner!==owner)throw Error('账号已切换，请重试。');set({profileSaving:true});
      try{const body={...profile,baseProfileVersion:profile.baseProfileVersion??(get().profile.version??get().profile.updatedAt??0)};
        const result=await api('/api/life/profile',{method:'PUT',body:JSON.stringify(body)});
        if(get().owner===owner){set(s=>({profile:result.profile,profileBackup:result.profile,profileSequence:s.profileSequence+1}));try{await changeLifeCache(owner,c=>({...c,profile:result.profile,profileBackup:result.profile}))}catch{if(get().owner===owner)set({cacheError:'资料已保存到服务器，但本机缓存不可用。'})}}
        return result.profile;
      }finally{if(get().owner===owner)set({profileSaving:false})}
    });profileQueue=operation;return operation;
  },
  async syncWeight(weightKg,bodyUpdatedAt){
    const owner=get().owner;if(!owner||owner==='guest'||get().loading||get().loadedOwner!==owner||get().profileSaving)return;
    const operation=profileQueue.catch(()=>{}).then(async()=>{
      if(get().owner!==owner||get().loading||get().loadedOwner!==owner)return;
      const result=await api('/api/life/profile',{method:'PATCH',body:JSON.stringify({weightKg,bodyUpdatedAt})});
      if(get().owner===owner){set(s=>({profile:result.profile,profileSequence:s.profileSequence+1}));try{await changeLifeCache(owner,c=>({...c,profile:result.profile}))}catch{}}
    });profileQueue=operation;return operation;
  },
  async saveMeal(meal) {
    const owner = get().owner
    const snapshot={profile:structuredClone(get().profile),templates:structuredClone(get().templates||[]),ai:structuredClone(get().ai)}
    meal={...meal,clientId:meal.clientId||(!meal.id?crypto.randomUUID():null)}
    if (owner === 'guest') return get().localChange(s => { const item = { ...meal, id: meal.id || crypto.randomUUID(), updatedAt: Date.now() }; s.meals = [...s.meals.filter(m => m.id !== item.id), item]; return item })
    if(get().syncingMeals)throw new Error('正在同步饮食记录，请稍后再保存。')
    const staged=meal._pending||navigator.onLine===false
    if(!staged){
      try{
        const {meal:result}=await api('/api/life/meal',{method:'POST',body:JSON.stringify(meal)})
        if(get().owner===owner){set(s=>({meals:[...s.meals.filter(m=>m.id!==result.id),result],lastSavedAt:Date.now(),error:''}));try{await changeLifeCache(owner,c=>({...c,...snapshot,meals:[...c.meals.filter(m=>m.id!==result.id),result]}))}catch{if(get().owner===owner)set({cacheError:'已保存到服务器，但本机缓存失败。'})}}
        return result
      }catch(e){if(![0,502,503,504].includes(e.status))throw e}
    }
    if(get().owner!==owner)throw new Error('账号已切换，请重试。')
    const item={...structuredClone(meal),id:meal.id||'offline-'+crypto.randomUUID(),clientId:meal.clientId||crypto.randomUUID(),_pending:true,_original:meal._pending?meal._original||null:(meal.id?get().meals.find(x=>x.id===meal.id):null),_serverId:meal._serverId||(meal.id&&!meal.id.startsWith('offline-')?meal.id:null),_baseUpdatedAt:meal._baseUpdatedAt||meal.updatedAt||null,_rev:crypto.randomUUID(),updatedAt:Date.now()}
    const cache=await changeLifeCache(owner,c=>({...c,...snapshot,meals:[...c.meals.filter(m=>m.id!==item.id),item],pendingMeals:[...(c.pendingMeals||[]).filter(m=>m.id!==item.id),item]}))
    if(get().owner===owner)set({meals:cache.meals,pendingMeals:cache.pendingMeals,lastSavedAt:Date.now(),error:''})
    if(navigator.onLine!==false)get().flushMeals()
    return item
  },
  async discardPending(id){
    const owner=get().owner;if(!owner||owner==='guest'||get().syncingMeals)throw new Error('请稍后重试。');
    const cache=await changeLifeCache(owner,c=>{const item=c.pendingMeals.find(x=>x.id===id);return {...c,pendingMeals:c.pendingMeals.filter(x=>x.id!==id),meals:[...c.meals.filter(x=>x.id!==id),...(item?._original?[item._original]:[])]}});
    if(get().owner===owner)set({meals:cache.meals,pendingMeals:cache.pendingMeals,error:''});
  },
  async saveTemplate(input) {
    const owner = get().owner
    if (owner === 'guest') return get().localChange(s => {
      if (!input.id && s.templates.length >= 100) throw new Error('最多收藏 100 份常吃餐。')
      const template = { ...structuredClone(input), id: input.id || crypto.randomUUID(), photo: '', updatedAt: Date.now() }
      s.templates = [...s.templates.filter(t => t.id !== template.id), template]; return template
    })
    const { template } = await api('/api/life/template', { method: 'POST', body: JSON.stringify(input) })
    if (get().owner === owner){set(s=>({templates:[...(s.templates||[]).filter(t=>t.id!==template.id),template]}));try{await changeLifeCache(owner,c=>({...c,templates:[...(c.templates||[]).filter(t=>t.id!==template.id),template]}))}catch{if(get().owner===owner)set({cacheError:'常吃餐已保存到服务器，但本机缓存不可用。'})}}
    return template
  },
  async deleteTemplate(id) {
    const owner = get().owner
    if (owner === 'guest') return get().localChange(s => { s.templates = s.templates.filter(t => t.id !== id) })
    await api('/api/life/template', { method: 'DELETE', body: JSON.stringify({ id }) })
    if(get().owner===owner){set(s=>({templates:(s.templates||[]).filter(t=>t.id!==id)}));try{await changeLifeCache(owner,c=>({...c,templates:(c.templates||[]).filter(t=>t.id!==id)}))}catch{if(get().owner===owner)set({cacheError:'收藏已从服务器移除，但本机缓存未能更新。'})}}
  },
  async deleteMeal(id) {
    const owner = get().owner
    if (owner === 'guest') return get().localChange(s => { s.meals = s.meals.filter(m => m.id !== id) })
    if((get().pendingMeals||[]).some(m=>m.id===id))throw new Error('请等待此记录同步后再删除；当前内容仍在本机待同步列表中。')
    await api('/api/life/meal', { method: 'DELETE', body: JSON.stringify({ id }) })
    if (get().owner === owner){set(s=>({meals:s.meals.filter(m=>m.id!==id)}));try{await changeLifeCache(owner,c=>({...c,meals:c.meals.filter(m=>m.id!==id)}))}catch{}}
  },
}))
export const assetURL = id => !id ? '' : id.startsWith('data:image/') ? id : `${appBase().replace(/\/$/, '')}/api/life/asset?id=${encodeURIComponent(id)}`
export async function uploadLifestyle(blob,options={}) {
  const state=useStore.getState(),owner=state.user?.id
  if(state.config?.communityMedia?.multipart)return uploadMultipart(blob,{...options,isCurrent:()=>useStore.getState().user?.id===owner})
  return api('/api/life/upload', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob })
}
export async function imageBlob(file, { avatar = false } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件。')
  if (file.size > 20 * 1024 * 1024) throw new Error('图片过大，请选择小于 20 MB 的照片。')
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('无法读取图片，请使用 JPG、PNG 或 WebP。')); img.src = url })
    const canvas = document.createElement('canvas')
    if (avatar) {
      canvas.width = canvas.height = 256
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      canvas.getContext('2d').drawImage(img, (img.naturalWidth-side)/2, (img.naturalHeight-side)/2, side, side, 0, 0, 256, 256)
    } else {
      const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight))
      canvas.width = Math.round(img.naturalWidth*scale); canvas.height = Math.round(img.naturalHeight*scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    }
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片处理失败。')), 'image/jpeg', .82))
  } finally { URL.revokeObjectURL(url) }
}
export const dataURL = blob => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('无法读取照片。')); r.readAsDataURL(blob) })
