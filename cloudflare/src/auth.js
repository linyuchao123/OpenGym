import {hashPassword,verifyPassword,validatePassword,nameKey,normalizeEmail} from './password.js';
import {inviteAvailable,inviteInfo,consumeInvite} from '../../api/shared/invitations.js';
import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import {HttpError} from './repository.js';
import {makeLinkCode,hashLinkCode} from '../../api/device-link.js';
export const publicUser=u=>({id:u.id,name:u.name,admin:u.admin===true});
const nowISO=()=>new Date().toISOString();
const random=()=>{const b=crypto.getRandomValues(new Uint8Array(32));return Buffer.from(b).toString('base64url')};
const digest=async text=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))).toString('hex');
export async function authContext(repo,request,env){
 const snapshot=await repo.load('auth'),rows=snapshot.rows;
 const get=(kind,id)=>{const value=rows.get(kind+':'+id);return value?JSON.parse(value):null};
 const list=kind=>[...rows].filter(([key])=>key.startsWith(kind+':')).map(([,v])=>JSON.parse(v));
 const set=(kind,id,value)=>rows.set(kind+':'+id,JSON.stringify(value));
 const drop=(kind,id)=>rows.delete(kind+':'+id);
 snapshot.rows=new Map(rows);
 for(const [key,raw] of rows){if(/^(session|challenge|link):/.test(key)&&JSON.parse(raw).exp<Date.now())rows.delete(key);}
 const save=()=>repo.save(snapshot,new Map(rows));
 // snapshot.rows must remain the last persisted copy for change detection.
 const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('gym_cf='))?.slice(7)||'';
 const session=token?get('session',await digest(token)):null;
 let user=session&&session.exp>Date.now()?get('user',session.uid):null;
 if(user?.disabled||session?.sv!==(user?.sv||0))user=null;
 const need=()=>{if(!user)throw new HttpError(401,'请先登录。');return user};
 const admin=()=>{const u=need();if(!u.admin)throw new HttpError(403,'仅管理员可操作。');return u};
 const origin=env.ORIGIN||new URL(request.url).origin,rpID=env.RP_ID||new URL(origin).hostname;
 const cookie=(value,maxAge)=>`gym_cf=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${origin.startsWith('https:')?'; Secure':''}`;
 const mint=async u=>{const value=random();set('session',await digest(value),{uid:u.id,sv:u.sv||0,exp:Date.now()+30*86400000});return cookie(value,30*86400)};
 const challenge=async(data)=>{const cid=random();set('challenge',cid,{...data,exp:Date.now()+300000});await save();return cid};
 const take=async(cid,kind)=>{const c=get('challenge',cid);if(!c||c.kind!==kind||c.exp<Date.now())throw new HttpError(400,'验证已过期，请重试。','challenge-expired');drop('challenge',cid);await save();return c};
 const keys=u=>list('credential').filter(c=>c.userId===u.id);
 const passkeys=u=>({passkeys:keys(u).map(({publicKey,...c})=>c),password:!!u.password,lastWayIn:keys(u).length+(u.password?1:0)<=1});
 const checkAssertion=async(body,owner)=>{
  const c=await take(body.cid,'login'),cred=get('credential',body.credential?.id);
  if(!cred||(owner&&cred.userId!==owner.id))throw new HttpError(400,'通行密钥无法确认账号。','unknown-credential');
  const verification=await verifyAuthenticationResponse({response:body.credential,expectedChallenge:c.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:false,credential:{id:cred.id,publicKey:Buffer.from(cred.publicKey,'base64url'),counter:cred.counter,transports:cred.transports||[]}});
  if(!verification.verified)throw new HttpError(400,'通行密钥验证失败。');
  cred.counter=verification.authenticationInfo.newCounter;cred.lastUsed=nowISO();set('credential',cred.id,cred);return get('user',cred.userId);
 };
 const passwordHolder=value=>{const k=nameKey(value);return list('user').find(u=>u.password&&(nameKey(u.name)===k||u.email===k))};
 const passwordThrottle=async(value,kind)=>{
  const addr=request.headers.get('cf-connecting-ip')||'local',key=await digest(nameKey(value).slice(0,254));
  await repo.throttle('auth-password-ip:'+addr,30,300);
  await repo.throttle('auth-password:'+kind+':'+key,8,300);
 };
 const proveOwner=async(body,u)=>{
  if(body.credential){await checkAssertion(body,u);return}
  await passwordThrottle(u.name,'owner');
  if(!u.password||!await verifyPassword(body.current,u.password))throw new HttpError(403,'请使用当前密码或通行密钥确认本人。','current-wrong');
 };
 async function route(path,body){
  if(path==='POST /api/register/password'){
   const name=String(body.name||'').trim().slice(0,40),code=String(body.code||'').trim().toUpperCase();
   if(!name)throw new HttpError(400,'请填写昵称。');
   const first=!list('user').length,invite=get('invite',code);
   if(first||!inviteAvailable(invite))throw new HttpError(403,'请使用有效的邀请码。','invite');
   await passwordThrottle(name,'signup');validatePassword(body.password,name);
   const email=body.email?normalizeEmail(body.email):null;if(body.email&&!email)throw new HttpError(400,'邮箱格式不正确。','email-invalid');
   if(passwordHolder(name))throw new HttpError(409,'该昵称已用于密码登录，请换一个昵称。','name-taken');
   if(email&&passwordHolder(email))throw new HttpError(409,'此邮箱已被使用。','email-taken');
   const u={id:crypto.randomUUID(),name,created:nowISO(),admin:false,sv:0,invitedBy:code,password:await hashPassword(body.password),...(email?{email}:{})};
   set('user',u.id,u);consumeInvite(invite,u.id,nowISO());set('invite',code,invite);const header=await mint(u);await save();return {user:publicUser(u),$cookie:header};
  }
  if(path==='POST /api/login/password'){
   await passwordThrottle(body.name,'login');const u=passwordHolder(body.name);
   if(!await verifyPassword(body.password,u?.password)||!u||u.disabled||(get('reset',u.id)?.exp>Date.now()))throw new HttpError(401,'昵称、邮箱或密码不正确。','bad-credentials');
   const header=await mint(u);await save();return {user:publicUser(u),$cookie:header};
  }
  if(path==='GET /api/account/password'){
   const u=need();return {set:!!u.password,name:u.name,email:u.email||null,passkeys:keys(u).length,nameTaken:!!passwordHolder(u.name)&&passwordHolder(u.name).id!==u.id};
  }
  if(path==='POST /api/account/password'||path==='DELETE /api/account/password'){
   const u=need();await proveOwner(body,u);
   if(path.startsWith('DELETE')){if(!keys(u).length)throw new HttpError(409,'请保留至少一种登录方式。','last-way-in');delete u.password}
   else{validatePassword(body.next,u.name);const other=passwordHolder(u.name);if(other&&other.id!==u.id)throw new HttpError(409,'此昵称已用于其他账号的密码登录。','name-taken');u.password=await hashPassword(body.next)}
   u.sv=(u.sv||0)+1;set('user',u.id,u);drop('reset',u.id);const header=await mint(u);await save();return {ok:true,$cookie:header};
  }
  if(path==='POST /api/account/email'||path==='DELETE /api/account/email'){
   const u=need();await proveOwner(body,u);
   if(path.startsWith('DELETE'))delete u.email;
   else{const email=normalizeEmail(body.email);if(!email)throw new HttpError(400,'邮箱格式不正确。','email-invalid');const other=passwordHolder(email);if(other&&other.id!==u.id)throw new HttpError(409,'此邮箱已被使用。','email-taken');u.email=email}
   set('user',u.id,u);await save();return {ok:true};
  }
  if(path==='POST /api/admin/user/password-reset'){
   admin();const u=get('user',body.id);if(!u||u.disabled||!u.password)throw new HttpError(400,'此账号没有可重置的密码。');
   const code=makeLinkCode(),expires=Date.now()+86400000;set('reset',u.id,{hash:await digest(code),exp:expires});u.sv=(u.sv||0)+1;set('user',u.id,u);await save();return {code,expires,name:u.name};
  }
  if(path==='POST /api/login/password-reset'){
   await passwordThrottle(body.name,'reset');const u=passwordHolder(body.name),r=u&&get('reset',u.id);
   if(!u||u.disabled||!r||r.exp<Date.now()||r.hash!==await digest(String(body.code||'').trim().toUpperCase()))throw new HttpError(400,'重置码无效或已过期。','reset-invalid');
   validatePassword(body.next,u.name);u.password=await hashPassword(body.next);u.sv=(u.sv||0)+1;set('user',u.id,u);drop('reset',u.id);const header=await mint(u);await save();return {user:publicUser(u),$cookie:header};
  }
  if(path==='GET /api/me')return {user:publicUser(need())};
  if(path==='POST /api/login/options'){
   const options=await generateAuthenticationOptions({rpID,userVerification:'preferred',allowCredentials:[]});return {cid:await challenge({kind:'login',challenge:options.challenge}),options};
  }
  if(path==='POST /api/register/options'){
   const name=String(body.name||'').trim().slice(0,40),code=String(body.code||'').trim().toUpperCase();if(!name)throw new HttpError(400,'请填写昵称。');
   const first=!list('user').length,invite=get('invite',code);
   if(first?(!env.BOOTSTRAP_CODE||code!==env.BOOTSTRAP_CODE.toUpperCase()):(!inviteAvailable(invite)))throw new HttpError(403,'请使用有效且仍有名额的邀请码。','invite');
   const uid=crypto.randomUUID(),options=await generateRegistrationOptions({rpName:'我的健身记录',rpID,userID:Buffer.from(uid),userName:name,userDisplayName:name,attestationType:'none',authenticatorSelection:{residentKey:'required',userVerification:'preferred'}});
   return {cid:await challenge({kind:'register',challenge:options.challenge,uid,name,code,first}),options};
  }
  if(path==='POST /api/register/verify'||path==='POST /api/account/passkeys/verify'||path==='POST /api/device-link/verify'){
   const adding=path.includes('/account/'),linking=path==='POST /api/device-link/verify',c=await take(body.cid,linking?'link':adding?'add':'register');if(adding&&(need().id!==c.uid||c.sv!==(user.sv||0)))throw new HttpError(401,'请重新确认账号。');
   const v=await verifyRegistrationResponse({response:body.credential,expectedChallenge:c.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:false});if(!v.verified)throw new HttpError(400,'通行密钥验证失败。');
   const cred=v.registrationInfo.credential;if(get('credential',cred.id))throw new HttpError(409,'这枚通行密钥已经注册。');
   let u=adding?user:linking?get('user',c.uid):null;
   if(linking){const h=hashLinkCode(String(body.code||'')),link=get('link',h);if(!link||link.exp<Date.now()||link.uid!==c.uid||h!==c.lh||!u||u.disabled||link.sv!==(u.sv||0))throw new HttpError(400,'设备码已过期或使用。','link-invalid');drop('link',h)}
   if(!adding&&!linking){const invite=get('invite',c.code);if(c.first?list('user').length>0:(!inviteAvailable(invite)))throw new HttpError(403,'邀请码已失效。','invite');
    u={id:c.uid,name:c.name,created:nowISO(),admin:c.first,sv:0,...(!c.first?{invitedBy:c.code}:{})};set('user',u.id,u);
    if(invite){consumeInvite(invite,u.id,nowISO());set('invite',c.code,invite)}
   }
   if(keys(u).length>=10)throw new HttpError(409,'最多添加10枚通行密钥。');
   set('credential',cred.id,{id:cred.id,userId:u.id,publicKey:Buffer.from(cred.publicKey).toString('base64url'),counter:cred.counter||0,transports:body.credential?.response?.transports||[],name:String(body.name||'').slice(0,60),created:nowISO(),lastUsed:nowISO()});
   const header=adding?null:await mint(u);await save();return {user:publicUser(u),...passkeys(u),...(header?{$cookie:header}:{})};
  }
  if(path==='POST /api/login/verify'){
   let u;try{u=await checkAssertion(body)}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'通行密钥验证失败。')}
   if(!u||u.disabled)throw new HttpError(403,'账号不可用。');const header=await mint(u);await save();return {user:publicUser(u),$cookie:header};
  }
  if(path==='POST /api/logout'||path==='POST /api/logout/all'){
   if(path.endsWith('/all')){const u=need();u.sv=(u.sv||0)+1;set('user',u.id,u)}
   if(token)drop('session',await digest(token));await save();return {ok:true,$cookie:cookie('',0)};
  }
  if(path==='POST /api/account/device-link'){
   const u=need();if(keys(u).length>=10)throw new HttpError(409,'最多添加10枚通行密钥。');await proveOwner(body,u);for(const link of list('link'))if(link.uid===u.id)drop('link',link.h);
   const code=makeLinkCode(),h=hashLinkCode(code),exp=Date.now()+600000;set('link',h,{h,uid:u.id,sv:u.sv||0,exp});await save();return {code,expires:exp};
  }
  if(path==='POST /api/device-link/options'){
   const h=hashLinkCode(String(body.code||'')),link=get('link',h),u=link&&get('user',link.uid);if(!link||link.exp<Date.now()||!u||u.disabled||link.sv!==(u.sv||0))throw new HttpError(400,'设备码已过期或使用。','link-invalid');
   const options=await generateRegistrationOptions({rpName:'我的健身记录',rpID,userID:Buffer.from(u.id),userName:u.name,attestationType:'none',authenticatorSelection:{residentKey:'required',userVerification:'preferred'},excludeCredentials:keys(u).map(c=>({id:c.id,transports:c.transports}))});return {cid:await challenge({kind:'link',challenge:options.challenge,uid:u.id,lh:h}),options,id:u.id,name:u.name};
  }
  if(path==='GET /api/account/passkeys')return passkeys(need());
  if(path==='POST /api/account/passkeys/options'){
   const u=need();if(keys(u).length>=10)throw new HttpError(409,'最多添加10枚通行密钥。');await proveOwner(body,u);
   const options=await generateRegistrationOptions({rpName:'我的健身记录',rpID,userID:Buffer.from(u.id),userName:u.name,attestationType:'none',authenticatorSelection:{residentKey:'required',userVerification:'preferred'},excludeCredentials:keys(u).map(c=>({id:c.id,transports:c.transports}))});
   return {cid:await challenge({kind:'add',challenge:options.challenge,uid:u.id,sv:u.sv||0}),options};
  }
  if(path==='POST /api/account/passkeys/rename'){
   const u=need(),c=get('credential',body.id);if(c?.userId!==u.id)throw new HttpError(404,'通行密钥不存在。');c.name=String(body.name||'').trim().slice(0,60);set('credential',c.id,c);await save();return {ok:true,...passkeys(u)};
  }
  if(path==='DELETE /api/account/passkeys'){
   const u=need(),id=new URL(request.url).searchParams.get('id'),c=get('credential',id);if(c?.userId!==u.id)throw new HttpError(404,'通行密钥不存在。');if(keys(u).length<=1&&!u.password)throw new HttpError(409,'请保留至少一种登录方式。','last-way-in');await proveOwner(body,u);drop('credential',id);for(const link of list('link'))if(link.uid===u.id)drop('link',link.h);await save();return {ok:true,...passkeys(u)};
  }
  if(path==='GET /api/inviter'){const u=need();return {inviterId:get('invite',u.invitedBy)?.createdBy||null}}
  if(path==='GET /api/admin/invites'){admin();return {invites:list('invite').map(i=>({...inviteInfo(i),usedByName:get('user',i.usedBy)?.name||null})),invite_only:true}}
  if(path==='POST /api/admin/invites/new'){
   const u=admin(),code=random().slice(0,24).replace(/[-_]/g,'A').toUpperCase(),invite={code,maxUses:10,createdBy:u.id,note:String(body.note||'').slice(0,60),created:nowISO()};set('invite',code,invite);await save();return {invite};
  }
  if(path==='POST /api/admin/invites/update'){
   admin();const code=String(body.code||'').trim().toUpperCase(),inv=get('invite',code);
   if(!inv)throw new HttpError(404,'邀请码不存在。');
   if(!Number.isInteger(body.maxUses)||body.maxUses<1||body.maxUses>100)throw new HttpError(400,'名额须为1至100。');
   if(inv.revoked)throw new HttpError(409,'此邀请码已撤销，请创建新码。');
   inv.maxUses=body.maxUses;set('invite',code,inv);await save();return {invite:inviteInfo(inv)};
  }
  if(path==='POST /api/admin/invites/revoke'){
   admin();const code=String(body.code||'').toUpperCase(),inv=get('invite',code);if(!inv)throw new HttpError(404,'邀请码不存在。');inv.revoked=true;set('invite',code,inv);await save();return {ok:true};
  }
  if(path==='GET /api/admin/users'){admin();const {results}=await repo.db.prepare("SELECT a.id,json_extract(p.body,'$.profile.nickname') AS nickname,json_extract(p.body,'$.profile.avatar') AS avatar,json_extract(t.body,'$.at') AS lastActiveAt FROM documents a LEFT JOIN documents p ON p.scope='life' AND p.id='people:'||substr(a.id,6) LEFT JOIN documents t ON t.scope='activity' AND t.id=substr(a.id,6) WHERE a.scope='auth' AND a.id LIKE 'user:%'").all();const extras=new Map(results.map(x=>[x.id.slice(5),x]));return {users:list('user').map(u=>({...publicUser(u),created:u.created,disabled:!!u.disabled,password:!!u.password,...(u.email?{email:u.email}:{}),resetUntil:get('reset',u.id)?.exp||null,nickname:extras.get(u.id)?.nickname||u.name,avatar:extras.get(u.id)?.avatar||'',lastActiveAt:extras.get(u.id)?.lastActiveAt||null})),invite_only:true}}
  if(path==='POST /api/admin/user/disable'){admin();const u=get('user',body.id);if(!u)throw new HttpError(404,'成员不存在。');if(u.admin)throw new HttpError(400,'不能停用管理员。');u.disabled=body.disabled===true;u.sv=(u.sv||0)+1;set('user',u.id,u);await save();return {ok:true,id:u.id,disabled:u.disabled}}
  return null;
 }
 return {user,route,need,admin,getMember:id=>{const u=get('user',id);return u&&!u.disabled?{id:u.id,name:u.name}:null}};
}

// A byte-range/photo request needs one session and its owner, not the whole auth registry.
export async function mediaSession(repo,request){
 const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('gym_cf='))?.slice(7)||'';
 if(!token)throw new HttpError(401,'请先登录。');
 const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
 // One D1 round trip per range request. Never cache authentication or disabled status.
 const row=await repo.db.prepare("SELECT s.body AS session,u.body AS user FROM documents s JOIN documents u ON u.scope='auth' AND u.id='user:'||json_extract(s.body,'$.uid') WHERE s.scope='auth' AND s.id=?").bind('session:'+hash).first();
 if(!row)throw new HttpError(401,'请先登录。');const session=JSON.parse(row.session),user=JSON.parse(row.user);
 if(session.exp<Date.now()||user.disabled||session.sv!==(user.sv||0))throw new HttpError(401,'请先登录。');return user;
}
