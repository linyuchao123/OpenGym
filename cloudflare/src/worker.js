import {r2UploadRoute,cleanupUploads,validMedia} from './r2-media.js';
import {Repository,HttpError,lifeStorage,blobResponse,lifestyleAsset,unreadSummary} from './repository.js';
import {authContext,mediaSession} from './auth.js';
import {lifestyleRoutes} from '../../api/lifestyle.js';
import {prepareState,forClient} from './state.js';
import {exerciseClip} from './exercise-media.js';
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
async function boundedBody(request,max=2*1024*1024){
 const length=Number(request.headers.get('content-length'));if(length>max)throw new HttpError(413,'请求过大。');
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();const parts=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new HttpError(413,'请求过大。')}parts.push(value)}const out=new Uint8Array(size);let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length}return out;
}
async function parseBody(request){const raw=await boundedBody(request,1800000);try{return raw.length?JSON.parse(new TextDecoder().decode(raw)):{} }catch{throw new HttpError(400,'请求格式不正确。')}}
function bridge(request,bytes){
 const req={url:request.url,method:request.method,headers:Object.fromEntries(request.headers),async *[Symbol.asyncIterator](){yield Buffer.from(bytes||[])}};
 let result;const res={writeHead(status,headers={}){this.status=status;this.headers=headers;return this},end(body){result=new Response(request.method==='HEAD'?null:body||null,{status:this.status||200,headers:this.headers||{}})},destroy(){throw new HttpError(500,'素材读取失败。')}};
 return {req,res,get response(){return result}};
}
export default {
 async scheduled(event,env,ctx){if(env.MEDIA_STORE==='r2')ctx.waitUntil(cleanupUploads(new Repository(env.DB),env.MEDIA))},
 async fetch(request,env){
  const url=new URL(request.url),key=request.method+' '+url.pathname;
  if(url.pathname.startsWith('/exercise-media/clip/'))return exerciseClip(request,env.ASSETS);
  if(url.pathname.startsWith('/music/')&&url.pathname.endsWith('.mp3'))return exerciseClip(request,env.ASSETS,{music:true});
  if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{
   if(!env.DB)throw new HttpError(503,'数据库尚未配置。');
   const repo=new Repository(env.DB),bucket=env.MEDIA_STORE==='r2'?env.MEDIA:null;
   const chunk=/^\/api\/uploads\/[\w-]+\/parts\/\d+$/.test(url.pathname);
   if(key==='GET /api/health'){await env.DB.prepare('SELECT 1 AS ok').first();return json({ok:true,hosting:bucket?'cloudflare-r2':'cloudflare-free'})}
   if(!['GET','HEAD'].includes(request.method)){
    const origin=request.headers.get('origin'),expected=env.ORIGIN||url.origin;
    if(origin!==expected)throw new HttpError(403,'请从站点页面提交操作。');
    await repo.throttle((chunk?'upload-part:':'write:')+(chunk?'':url.pathname+':')+(request.headers.get('cf-connecting-ip')||'local'),chunk?120:60,60);
   }
   if(key==='GET /api/life/unread'){const viewer=await mediaSession(repo,request);return json(await unreadSummary(repo,viewer.id))}
   if(['GET /api/life/asset','HEAD /api/life/asset'].includes(key)){const viewer=await mediaSession(repo,request);return await lifestyleAsset(repo,viewer.id,url.searchParams.get('id'),request,bucket)}
   const auth=await authContext(repo,request,env);
   if(key==='GET /api/config')return json({invite_only:true,password_login:true,allow_guest:env.ALLOW_GUEST==='1',default_lang:'zh',hosting:bucket?'cloudflare-r2':'cloudflare-free',...(bucket?{fitnessPlanner:!!env.FOOD_AI_API_KEY,communityMedia:{multipart:true,partMB:5,imageMB:20,videoMB:200,audioMB:2,videoSec:0,quotaMB:1024,siteQuotaMB:8192}}:{}),media:{imageMB:2,gifMB:2,videoMB:2,videoSec:60,quotaMB:20,workouts:true},...(auth.user?{coach:null}:{}),cloudflare:{siteMediaMB:bucket?8192:100,mediaStore:bucket?'r2':'d1',passwordLogin:true,push:false}});
   if(auth.user&&!url.pathname.startsWith('/api/uploads/')&&!url.pathname.includes('/asset')&&!url.pathname.startsWith('/api/media/')){const at=Date.now();await env.DB.prepare("INSERT INTO documents(scope,id,body) VALUES('activity',?,?) ON CONFLICT(scope,id) DO UPDATE SET body=excluded.body WHERE CAST(json_extract(documents.body,'$.at') AS INTEGER)<?").bind(auth.user.id,JSON.stringify({at}),at-300000).run();}
   const jsonBody=!['GET','HEAD'].includes(request.method)&&!/^\/api\/media\/[a-f0-9]{64}$/.test(url.pathname)&&url.pathname!=='/api/life/upload'&&!chunk;
   const body=jsonBody?await parseBody(request):{};
   const authReply=await auth.route(key,body);
   if(authReply){const {$cookie,...data}=authReply;return json(data,200,$cookie?{'Set-Cookie':$cookie}:{})}
   const u=auth.need();
   if(url.pathname.startsWith('/api/uploads/'))return await r2UploadRoute(request,repo,bucket,u,body,boundedBody);
   if(key==='GET /api/data'||key==='GET /api/data/rev'){
    const state=await repo.read('state',u.id);return json(key.endsWith('/rev')?{rev:state?._rev||0,...(state?._wid?{wid:state._wid}:{})}:{state:forClient(state),rev:state?._rev||0});
   }
   if(key==='PUT /api/data'){
    const snap=await repo.load('state'),cur=JSON.parse(snap.rows.get(u.id)||'null'),state=prepareState(cur,body),rows=new Map(snap.rows);rows.set(u.id,JSON.stringify(state));
    try{await repo.save(snap,rows)}catch(e){if(e.status===409){const latest=await repo.read('state',u.id);throw Object.assign(e,{data:{state:forClient(latest),rev:latest?._rev||0}})}throw e}
    return json({ok:true,ts:state._ts||null,rev:state._rev,wid:state._wid});
   }
   if(key==='GET /api/admin/user'){
    auth.admin();const id=url.searchParams.get('id'),s=await repo.read('state',id)||{},a=await repo.read('auth','user:'+id);if(!a)throw new HttpError(404,'成员不存在。');return json({user:{id:a.id,name:a.name,admin:!!a.admin,disabled:!!a.disabled,created:a.created},unit:s.unit||'kg',routines:s.routines||[],bodyweight:s.bodyweight||[],workouts:(s.workouts||[]).map(({media,...w})=>w)});
   }
   if(key==='POST /api/media/missing'){
    if(!Array.isArray(body.hashes)||body.hashes.length>1000||!body.hashes.every(h=>/^[a-f0-9]{64}$/.test(h)))throw new HttpError(400,'素材标识不正确。');
    const {results}=await env.DB.prepare('SELECT id FROM blobs WHERE owner=?').bind(u.id).all(),present=new Set(results.map(r=>r.id));const missing=[...new Set(body.hashes)].filter(h=>!present.has('training/'+u.id+'/'+h));return json({missing,usage:await repo.usage(u.id)});
   }
   const match=/^\/api\/media\/([a-f0-9]{64})$/.exec(url.pathname);
   if(match){const id='training/'+u.id+'/'+match[1];if(['GET','HEAD'].includes(request.method))return blobResponse(repo,id,request.method,request.headers.get('range'));
    if(request.method==='PUT'){
     const mime=(request.headers.get('content-type')||'').split(';')[0],bytes=await boundedBody(request);if(!validMedia(bytes,mime))throw new HttpError(400,'素材格式不正确。','media-invalid');
     const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');if(hash!==match[1])throw new HttpError(400,'素材校验失败。','hash-mismatch');await repo.putBlob(id,u.id,mime,bytes);return json({ok:true,hash,usage:await repo.usage(u.id)},201);
    }
   }
   if(['GET /api/life/asset','HEAD /api/life/asset'].includes(key))return await lifestyleAsset(repo,u.id,url.searchParams.get('id'),request,bucket);
   if(url.pathname.startsWith('/api/life/')){
    const storage=await lifeStorage(repo,u.id,bucket),routes=await lifestyleRoutes({storage,getMember:auth.getMember,aiConfig:env,json:(res,status,data,headers={})=>res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}).end(JSON.stringify(data)),readBody:async()=>body,readSession:()=>u,isAdmin:user=>user.admin===true});
    const handler=routes[key];if(!handler)throw new HttpError(404,'接口不存在。');
    const bytes=url.pathname==='/api/life/upload'?await boundedBody(request):null;
    if(bytes&&!validMedia(bytes,(request.headers.get('content-type')||'').split(';')[0]))throw new HttpError(400,'素材格式不正确。');
    const transport=bridge(request,bytes);await handler(transport.req,transport.res);return transport.response||json({error:'请求未完成。'},500);
   }
   throw new HttpError(404,'免费部署版暂未接入此接口。','not-available');
  }catch(e){if(!(e instanceof HttpError)&&!e.status)console.error('Cloudflare request failed',e.name);return json({error:e.status?e.message:'服务暂不可用，请稍后重试。',...(e.code?{code:e.code}:{}),...(e.data||{})},e.status||500)}
 }
};
