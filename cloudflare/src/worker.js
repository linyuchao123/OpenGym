import {pushRoute,messagePush,duePush,pushReady} from './push-service.js';
import {recordWritePaths} from './write-query.js';
import {usageMetrics,communityMetrics} from '../../api/shared/usage-metrics.js';
import {publicGrowth,growthHTML} from '../../api/shared/growth.js';
import {publicHeaders} from '../../api/lifestyle-growth.js';
import {r2UploadRoute,cleanupUploads,validMedia} from './r2-media.js';
import {Repository,HttpError,lifeStorage,blobResponse,lifestyleAsset,unreadSummary,acknowledgeNotifications} from './repository.js';
import {authContext,mediaSession,memberContext} from './auth.js';
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
async function handleRequest(request,env,stats,ctx){
  const url=new URL(request.url),key=request.method+' '+url.pathname;
  if(url.pathname.startsWith('/exercise-media/clip/'))return exerciseClip(request,env.ASSETS);
  if(url.pathname.startsWith('/music/')&&url.pathname.endsWith('.mp3'))return exerciseClip(request,env.ASSETS,{music:true});
  if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{
   if(!env.DB)throw new HttpError(503,'数据库尚未配置。');
   const repo=new Repository(env.DB,stats),bucket=env.MEDIA_STORE==='r2'?env.MEDIA:null;
   const chunk=/^\/api\/uploads\/[\w-]+\/parts\/\d+$/.test(url.pathname);
   if(key==='GET /api/health'){await repo.db.prepare('SELECT 1 AS ok').first();return json({ok:true,hosting:bucket?'cloudflare-r2':'cloudflare-free'})}
   if(!['GET','HEAD'].includes(request.method)){
    const origin=request.headers.get('origin'),expected=env.ORIGIN||url.origin;
    if(origin!==expected){if(!nativeOrigins.has(origin||'')&&origin)throw new HttpError(403,'请从站点页面提交操作。');if(url.pathname!=='/api/pair/redeem'){if(!request.headers.get('authorization')?.startsWith('Bearer '))throw new HttpError(403,'请先配对手机应用。');await mediaSession(repo,request)}}
    await repo.throttle((chunk?'upload-part:':'write:')+(chunk?'':url.pathname+':')+(request.headers.get('cf-connecting-ip')||'local'),chunk?120:60,60);
   }
   if(key==='GET /api/life/public-growth'){
    const token=url.searchParams.get('token');if(!/^[a-f0-9]{48}$/.test(token||''))throw new HttpError(404,'分享已关闭或不存在。');
    const row=await repo.db.prepare("SELECT id,body FROM documents WHERE scope='life' AND id LIKE 'people:%' AND json_extract(body,'$.profile.externalShare.token')=? AND json_extract(body,'$.profile.externalShare.enabled')=1").bind(token).first();
    if(!row)throw new HttpError(404,'分享已关闭或不存在。');const id=row.id.slice(7),owner=await repo.read('auth','user:'+id);
    if(!owner||owner.disabled)throw new HttpError(404,'分享已关闭或不存在。');
    return new Response(growthHTML(publicGrowth(JSON.parse(row.body).profile,await repo.read('state',id)||{})),{headers:publicHeaders});
   }
   if(key==='GET /api/life/unread'){const viewer=await mediaSession(repo,request);return json(await unreadSummary(repo,viewer.id))}
   if(['GET /api/life/asset','HEAD /api/life/asset'].includes(key)){const viewer=await mediaSession(repo,request);return await lifestyleAsset(repo,viewer.id,url.searchParams.get('id'),request,bucket)}
   const personal=['/api/data','/api/data/rev','/api/life/me','/api/life/profile','/api/life/template','/api/life/meal','/api/life/notifications/prefs','/api/life/share-config','/api/life/checkin','/api/life/nutrition-config','/api/life/food','/api/life/status','/api/life/meal-plan','/api/life/meal-plan/record','/api/life/location-config','/api/life/admin/location-config','/api/life/location/resolve'].includes(url.pathname);
   const viewer=personal?await mediaSession(repo,request):null;
   const auth=viewer?{user:viewer,need:()=>viewer,route:async()=>null,getMember:id=>id===viewer.id?viewer:null}:url.pathname.startsWith('/api/life/')?await memberContext(repo,request):await authContext(repo,request,env);
   if(key==='GET /api/config')return json({invite_only:true,password_login:true,allow_guest:env.ALLOW_GUEST==='1',default_lang:'zh',hosting:bucket?'cloudflare-r2':'cloudflare-free',...(bucket?{fitnessPlanner:!!env.FOOD_AI_API_KEY,communityMedia:{multipart:true,partMB:5,imageMB:20,videoMB:200,audioMB:2,videoSec:0,quotaMB:1024,siteQuotaMB:8192}}:{}),media:{imageMB:2,gifMB:2,videoMB:2,videoSec:60,quotaMB:20,workouts:true},...(auth.user?{coach:null}:{}),cloudflare:{siteMediaMB:bucket?8192:100,mediaStore:bucket?'r2':'d1',passwordLogin:true,push:pushReady(env)}});
   if(auth.user&&!url.pathname.startsWith('/api/uploads/')&&!url.pathname.includes('/asset')&&!url.pathname.startsWith('/api/media/')){const at=Date.now();await repo.db.prepare("INSERT INTO documents(scope,id,body) VALUES('activity',?,?) ON CONFLICT(scope,id) DO UPDATE SET body=excluded.body WHERE CAST(json_extract(documents.body,'$.at') AS INTEGER)<?").bind(auth.user.id,JSON.stringify({at}),at-300000).run();}
   const jsonBody=!['GET','HEAD'].includes(request.method)&&!/^\/api\/media\/[a-f0-9]{64}$/.test(url.pathname)&&url.pathname!=='/api/life/upload'&&!chunk;
   const body=jsonBody?await parseBody(request):{};
   const authReply=await auth.route(key,body);
   if(authReply){const {$cookie,...data}=authReply;return json(data,200,$cookie?{'Set-Cookie':$cookie}:{})}
   const u=auth.need();
   if(url.pathname.startsWith('/api/push/'))return json(await pushRoute(repo,env,u,key,body,url));
   if(key==='POST /api/life/location/resolve')await repo.throttle('location:'+u.id,10,60);
   if(key==='POST /api/life/notifications/read')return json(await acknowledgeNotifications(repo,u.id,body));
   if(url.pathname.startsWith('/api/uploads/'))return await r2UploadRoute(request,repo,bucket,u,body,boundedBody);
   if(key==='GET /api/data'||key==='GET /api/data/rev'){
    const state=await repo.read('state',u.id);return json(key.endsWith('/rev')?{rev:state?._rev||0,...(state?._wid?{wid:state._wid}:{})}:{state:forClient(state),rev:state?._rev||0});
   }
   if(key==='PUT /api/data'){
    const snap=await repo.loadRecord('state',u.id),cur=JSON.parse(snap.rows.get(u.id)||'null'),state=prepareState(cur,body),rows=new Map(snap.rows);rows.set(u.id,JSON.stringify(state));
    try{await repo.save(snap,rows)}catch(e){if(e.status===409){const latest=await repo.read('state',u.id);throw Object.assign(e,{data:{state:forClient(latest),rev:latest?._rev||0}})}throw e}
    return json({ok:true,ts:state._ts||null,rev:state._rev,wid:state._wid});
   }
   if(key==='GET /api/admin/usage'){
    auth.admin();const result=await repo.db.prepare("SELECT scope,id,body FROM documents WHERE (scope='auth' AND id LIKE 'user:%') OR scope='state' OR (scope='life' AND id LIKE 'people:%')").all();
    const users=[],states={},people={};for(const r of result.results){const v=JSON.parse(r.body);if(r.scope==='auth')users.push(v);else if(r.scope==='state')states[r.id]=v;else people[r.id.slice(7)]=v}
    const quality=await repo.db.prepare("SELECT kind,SUM(samples) samples,SUM(failures) failures,SUM(conflicts) conflicts,ROUND(SUM(total_ms)*1.0/SUM(samples)) avgMs,MAX(max_ms) maxMs,SUM(rows_read) rowsRead,SUM(rows_written) rowsWritten,SUM(queries) queries FROM service_quality WHERE hour>=? GROUP BY kind").bind(new Date(Date.now()-7*86400000).toISOString().slice(0,13)).all();
    const month='site:'+new Date().toISOString().slice(0,7),aiCalls=await repo.read('life','aiUsage:'+month)||0;
    const postRows=await repo.db.prepare("SELECT json_object('uid',json_extract(body,'$.uid'),'createdAt',json_extract(body,'$.createdAt'),'deleted',json_extract(body,'$.deleted'),'comments',json_extract(body,'$.comments')) body FROM documents WHERE scope='life' AND id LIKE 'posts:%'").all();
    return json({...usageMetrics(users,states,people),community:communityMetrics(postRows.results.map(r=>JSON.parse(r.body)),people),quality:quality.results,ai:{monthlyCalls:aiCalls,monthlyLimit:Number(env.AI_SITE_MONTHLY_CALLS??300),note:'调用次数上限，不等于费用硬上限；失败的已预留调用仍计入。'}});
   }
   if(key==='GET /api/admin/user'){
    auth.admin();const id=url.searchParams.get('id'),s=await repo.read('state',id)||{},a=await repo.read('auth','user:'+id);if(!a)throw new HttpError(404,'成员不存在。');return json({user:{id:a.id,name:a.name,admin:!!a.admin,disabled:!!a.disabled,created:a.created},unit:s.unit||'kg',routines:s.routines||[],bodyweight:s.bodyweight||[],workouts:(s.workouts||[]).map(({media,...w})=>w)});
   }
   if(key==='POST /api/media/missing'){
    if(!Array.isArray(body.hashes)||body.hashes.length>1000||!body.hashes.every(h=>/^[a-f0-9]{64}$/.test(h)))throw new HttpError(400,'素材标识不正确。');
    const {results}=await repo.db.prepare('SELECT id FROM blobs WHERE owner=?').bind(u.id).all(),present=new Set(results.map(r=>r.id));const missing=[...new Set(body.hashes)].filter(h=>!present.has('training/'+u.id+'/'+h));return json({missing,usage:await repo.usage(u.id)});
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
    const storage=await lifeStorage(repo,u.id,bucket,personal,key==='GET /api/life/feed'?url.searchParams:null,request.method==='GET'&&['/api/life/messages','/api/life/inbox','/api/life/notifications','/api/life/people'].includes(url.pathname)?url.pathname:null,url.searchParams,recordWritePaths.has(key)?{key,body}:null),routes=await lifestyleRoutes({storage,onMessage:async message=>{const promise=messagePush(repo,env,message);if(ctx?.waitUntil)ctx.waitUntil(promise);else await promise},serviceConfig:{read:()=>repo.read('settings','location'),write:async value=>{const old=await repo.loadRecord('settings','location');await repo.save(old,new Map([['location',JSON.stringify(value)]]))}},getMember:auth.getMember,aiConfig:env,json:(res,status,data,headers={})=>res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}).end(JSON.stringify(data)),readBody:async()=>body,readSession:()=>u,isAdmin:user=>user.admin===true});
    const handler=routes[key];if(!handler)throw new HttpError(404,'接口不存在。');
    const bytes=url.pathname==='/api/life/upload'?await boundedBody(request):null;
    if(bytes&&!validMedia(bytes,(request.headers.get('content-type')||'').split(';')[0]))throw new HttpError(400,'素材格式不正确。');
    const transport=bridge(request,bytes);await handler(transport.req,transport.res);return transport.response||json({error:'请求未完成。'},500);
   }
   throw new HttpError(404,'免费部署版暂未接入此接口。','not-available');
  }catch(e){if(!(e instanceof HttpError)&&!e.status)console.error('Cloudflare request failed',e.name);return json({error:e.status?e.message:'服务暂不可用，请稍后重试。',...(e.code?{code:e.code}:{}),...(e.data||{})},e.status||500)}
 }
const nativeOrigins=new Set(['https://localhost','http://localhost','capacitor://localhost']);
export default {
 async scheduled(event,env,ctx){ctx.waitUntil(duePush(new Repository(env.DB),env));if(env.MEDIA_STORE==='r2')ctx.waitUntil(cleanupUploads(new Repository(env.DB),env.MEDIA));ctx.waitUntil(env.DB.prepare("DELETE FROM service_quality WHERE hour<?").bind(new Date(Date.now()-60*86400000).toISOString().slice(0,13)).run())},
 async fetch(request,env,ctx){
  const origin=request.headers.get('origin');
  if(request.method==='OPTIONS')return new Response(null,{status:nativeOrigins.has(origin)?204:403,headers:nativeOrigins.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600','Vary':'Origin'}:{}});
  const stats={rowsRead:0,rowsWritten:0,queries:0},started=Date.now(),source=await handleRequest(request,env,stats,ctx),p=new URL(request.url).pathname,response=nativeOrigins.has(origin)?new Response(source.body,{status:source.status,statusText:source.statusText,headers:source.headers}):source;
  if(nativeOrigins.has(origin)){response.headers.set('Access-Control-Allow-Origin',origin);response.headers.set('Vary','Origin')}
  const kind=p.startsWith('/api/login/')||p.startsWith('/api/register/')?'login':p==='/api/data'&&request.method==='PUT'?'save-training':p==='/api/life/meal'&&request.method==='POST'?'save-meal':p.startsWith('/api/uploads/')&&request.method!=='GET'?'upload':p==='/api/life/feed'?'feed':null;
  if(kind&&env.DB&&ctx?.waitUntil){const ms=Date.now()-started;ctx.waitUntil(env.DB.prepare("INSERT INTO service_quality(hour,kind,samples,failures,conflicts,total_ms,max_ms,rows_read,rows_written,queries) VALUES(?,?,1,?,?,?,?,?,?,?) ON CONFLICT(hour,kind) DO UPDATE SET samples=samples+1,failures=failures+excluded.failures,conflicts=conflicts+excluded.conflicts,total_ms=total_ms+excluded.total_ms,max_ms=MAX(max_ms,excluded.max_ms),rows_read=rows_read+excluded.rows_read,rows_written=rows_written+excluded.rows_written,queries=queries+excluded.queries").bind(new Date().toISOString().slice(0,13),kind,response.status>=400?1:0,response.status===409?1:0,ms,ms,stats.rowsRead,stats.rowsWritten,stats.queries).run().catch(()=>console.error('service-quality-write-failed')))}
  return response;
 }
};
