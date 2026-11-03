import {localDay,nextPlanReminder} from '../../api/shared/training-reminders.js';
import {HttpError} from './repository.js';
import {sendWebPush,validEndpoint} from './web-push.js';
import {effectiveRoutineId} from '../../api/queue.js';
const ready=env=>!!(env.WEB_PUSH_PUBLIC_KEY&&env.WEB_PUSH_PRIVATE_KEY);
const keys=env=>({publicKey:env.WEB_PUSH_PUBLIC_KEY,privateKey:env.WEB_PUSH_PRIVATE_KEY,subject:env.ORIGIN||'https://opengym.xiaolinyx.me'});
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
async function put(repo,scope,id,value){const old=await repo.loadRecord(scope,id);await repo.save(old,new Map(value?[[id,JSON.stringify(value)]]:[]))}
export async function pushRoute(repo,env,u,key,body,url){
 if(!ready(env))throw new HttpError(503,'通知服务尚未配置。');
 if(key==='GET /api/push/public-key')return {key:env.WEB_PUSH_PUBLIC_KEY};
 if(key==='GET /api/push/status'){const s=await repo.read('push',await digest(url.searchParams.get('endpoint')||''));return {subscribed:s?.uid===u.id,...(s?.uid===u.id?{deviceId:s.deviceId}:{} )}}
 if(key==='POST /api/push/subscribe'){
  const s=body.subscription;if(!s||!validEndpoint(s.endpoint)||!/^B[A-Za-z0-9_-]{86}$/.test(s.keys?.p256dh||'')||!/^[A-Za-z0-9_-]{22}$/.test(s.keys?.auth||''))throw new HttpError(400,'通知订阅无效。');
  const id=await digest(s.endpoint),old=await repo.read('push',id);if(old&&old.uid!==u.id)throw new HttpError(409,'此浏览器的通知属于另一个账号，请先关闭通知后重试。');
  const {n}=await repo.db.prepare("SELECT COUNT(*) n FROM documents WHERE scope='push' AND json_extract(body,'$.uid')=?").bind(u.id).first();if(!old&&n>=4)throw new HttpError(400,'最多开启四台设备的通知，请先关闭旧设备通知。');
  await put(repo,'push',id,{uid:u.id,endpoint:s.endpoint,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth},deviceId:/^[\w-]{8,64}$/.test(body.deviceId||'')?body.deviceId:null});return {ok:true};
 }
 if(key==='POST /api/push/unsubscribe'){const id=await digest(body.endpoint||''),s=await repo.read('push',id);if(s?.uid===u.id)await put(repo,'push',id,null);return {ok:true}}
 if(key==='POST /api/push/test'){const result=await deliverPush(repo,env,u.id,{title:'OpenGym',body:'通知连接已建立。',tag:'test',url:'/#/me/settings'});if(!result.sent)throw new HttpError(502,'推送服务未接受测试，请检查此设备订阅后重试。');return {ok:true}}
 if(key==='GET /api/push/preferences')return {preferences:await repo.read('push-prefs',u.id)||{messages:false,reminderAt:null,planReminder:{enabled:false,time:''}}};
 if(key==='PUT /api/push/preferences'){
  const at=body.reminderAt==null?null:Number(body.reminderAt);if(at!==null&&(!Number.isFinite(at)||at<Date.now()+30000||at>Date.now()+30*86400000))throw new HttpError(400,'请选择未来30天内的提醒时间。');
  let tz=typeof body.tz==='string'?body.tz:'Asia/Shanghai';try{new Intl.DateTimeFormat('en',{timeZone:tz}).format()}catch{throw new HttpError(400,'时区无效。')}const old=await repo.read('push-prefs',u.id)||{},plan=body.planReminder??old.planReminder??{enabled:false,time:''};if(typeof plan!=='object'||plan===null||(plan.enabled&& !/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.time||'')))throw new HttpError(400,'请选择每天的计划提醒时间。');const planReminder={enabled:plan.enabled===true,time:typeof plan.time==='string'?plan.time.slice(0,5):''};const unchanged=old.planReminder?.enabled===planReminder.enabled&&old.planReminder?.time===planReminder.time&&old.tz===tz;const p={uid:u.id,messages:body.messages===true,reminderAt:at,tz,planReminder,planNextAt:planReminder.enabled?(unchanged&&old.planNextAt>Date.now()?old.planNextAt:nextPlanReminder(planReminder.time,tz)):null};await put(repo,'push-prefs',u.id,p);return {preferences:p};
 }
 throw new HttpError(404,'通知接口不存在。');
}
export async function deliverPush(repo,env,uid,payload){
 if(!ready(env))return {sent:0};const user=await repo.read('auth','user:'+uid);if(!user||user.disabled)return {sent:0};
 const rows=await repo.db.prepare("SELECT id,body FROM documents WHERE scope='push' AND json_extract(body,'$.uid')=? LIMIT 4").bind(uid).all();let sent=0;
 for(const row of rows.results){try{const response=await sendWebPush(JSON.parse(row.body),payload,keys(env));if(response.ok)sent++;if(response.status===404||response.status===410)await put(repo,'push',row.id,null)}catch{}}
 return {sent};
}
const messagePayload=()=>({title:'OpenGym · 新私信',body:'有伙伴给你发来了一条消息。',tag:'message',url:'/#/messages'});
// Deliver immediately, queue only failures. The outbox contains routing metadata, never chat text.
export async function messagePush(repo,env,message,send=deliverPush){
 const p=await repo.read('push-prefs',message.to);if(!p?.messages)return;
 const result=await send(repo,env,message.to,messagePayload()).catch(()=>({sent:0}));
 if(!result.sent)await put(repo,'push-outbox',message.id,{uid:message.to,nextAt:Date.now()+60000,expiresAt:Date.now()+600000,attempts:0});
}
export async function duePush(repo,env,now=Date.now(),send=deliverPush){
 if(!ready(env))return;
 // Bounded batches keep free Worker subrequests under budget; cron runs every minute.
 const pending=await repo.db.prepare("SELECT id,body FROM documents WHERE scope='push-outbox' AND CAST(json_extract(body,'$.nextAt') AS INTEGER)<=? ORDER BY CAST(json_extract(body,'$.nextAt') AS INTEGER) LIMIT 2").bind(now).all();
 for(const row of pending.results){const item=JSON.parse(row.body),prefs=await repo.read('push-prefs',item.uid);if(item.expiresAt<=now||item.attempts>=5||!prefs?.messages){await put(repo,'push-outbox',row.id,null);continue}const result=await send(repo,env,item.uid,messagePayload()).catch(()=>({sent:0}));await put(repo,'push-outbox',row.id,result.sent?null:{...item,attempts:item.attempts+1,nextAt:now+60000*Math.min(5,2**item.attempts)})}
 const rows=await repo.db.prepare("SELECT id,body FROM documents WHERE scope='push-prefs' AND ((CAST(json_extract(body,'$.reminderAt') AS INTEGER)>0 AND CAST(json_extract(body,'$.reminderAt') AS INTEGER)<=?) OR (json_extract(body,'$.planReminder.enabled')=1 AND CAST(json_extract(body,'$.planNextAt') AS INTEGER)>0 AND CAST(json_extract(body,'$.planNextAt') AS INTEGER)<=?)) ORDER BY MIN(COALESCE(json_extract(body,'$.reminderAt'),1e20),COALESCE(json_extract(body,'$.planNextAt'),1e20)) LIMIT 2").bind(now,now).all();
 for(const row of rows.results){
  const snapshot=await repo.loadRecord('push-prefs',row.id),p=JSON.parse(snapshot.rows.get(row.id)||'null');if(!p||p.leaseUntil>now)continue;
  const once=p.reminderAt>0&&p.reminderAt<=now,daily=p.planReminder?.enabled&&p.planNextAt>0&&p.planNextAt<=now;if(!once&&!daily)continue;
  const token=crypto.randomUUID();try{await repo.save(snapshot,new Map([[row.id,JSON.stringify({...p,leaseUntil:now+60000,leaseToken:token})]]))}catch(e){if(e.status===409)continue;throw e}
  let sent=false,skip=false;try{
   const state=await repo.read('state',row.id)||{},date=localDay(now,p.tz||'Asia/Shanghai'),rid=effectiveRoutineId(state,date),routine=(state.routines||[]).find(r=>r.id===rid),done=(state.workouts||[]).some(w=>w.d===date&&(w.routineId===rid||w.routineIds?.includes(rid)));
   const freshOnce=once&&now-p.reminderAt<=3600000,freshDaily=daily&&now-p.planNextAt<=3600000;
   skip=!(freshOnce||(freshDaily&&routine&&!done));
   if(!skip){const result=await send(repo,env,row.id,{title:'OpenGym · 训练提醒',body:routine?`今天练：${routine.name}。准备好就开始吧。`:'到你设置的训练时间了，看看今天的安排吧。',tag:'training',url:'/#/home'});sent=result.sent>0}
  }catch{/* Leave due times intact so the next cron retries a transient failure. */}
  const current=await repo.loadRecord('push-prefs',row.id),latest=JSON.parse(current.rows.get(row.id)||'null');if(latest?.leaseToken!==token)continue;
  delete latest.leaseToken;delete latest.leaseUntil;
  if(sent||skip){if(once&&latest.reminderAt===p.reminderAt)latest.reminderAt=null;if(daily&&latest.planNextAt===p.planNextAt)latest.planNextAt=nextPlanReminder(p.planReminder.time,p.tz||'Asia/Shanghai',now);latest.lastReminderAt=sent?now:latest.lastReminderAt||null}
  try{await repo.save(current,new Map([[row.id,JSON.stringify(latest)]]))}catch(e){if(e.status!==409)throw e}
 }
}
export const pushReady=ready;
