import crypto from 'node:crypto';
import {growthSummary,publicGrowth,growthHTML} from './shared/growth.js';
export const publicHeaders={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
export function growthRoutes({wrap,getDB,commit,person,json,readBody,isAdmin,getMember,readState}){
 const fail=(res,error,status=400)=>json(res,status,{error});
 const clean=(x,n)=>typeof x==='string'?x.trim().slice(0,n):'';
 return {
 'GET /api/life/growth':wrap(async(req,res,u)=>{const id=new URL(req.url,'http://local').searchParams.get('id')||u.id,db=getDB();if(!getMember(id)||(db.blocks[u.id]||[]).includes(id)||(db.blocks[id]||[]).includes(u.id))return fail(res,'成员不存在或不可见。',404);json(res,200,{growth:growthSummary(await readState(id))})}),
 'POST /api/life/share-config':wrap(async(req,res,u)=>{
  const b=await readBody(req);if(typeof b.enabled!=='boolean')return fail(res,'请选择开启或关闭。');
  if(b.enabled&&b.consent!==true)return fail(res,'请确认站外公开范围。');
  const allowed=['nickname','goal','growth'];if(b.enabled&&(!Array.isArray(b.fields)||!b.fields.length||b.fields.some(k=>!allowed.includes(k))))return fail(res,'请选择有效公开字段。');
  const config={enabled:b.enabled,fields:b.enabled?[...new Set(b.fields)]:[],token:b.enabled?crypto.randomBytes(24).toString('hex'):null,updatedAt:Date.now()};
  await commit(s=>{const p=person(s,u.id);p.profile.externalShare=config;p.profile.version=Math.max(Date.now(),(p.profile.version||0)+1);p.profile.updatedAt=Date.now()});
  json(res,200,{profile:getDB().people[u.id].profile});
 }),
 'GET /api/life/public-growth':async(req,res)=>{
  const token=new URL(req.url,'http://local').searchParams.get('token');if(!/^[a-f0-9]{48}$/.test(token||''))return fail(res,'分享已关闭或不存在。',404);
  const found=Object.entries(getDB().people).find(([,p])=>p.profile?.externalShare?.enabled&&p.profile.externalShare.token===token);
  if(!found||!getMember(found[0]))return fail(res,'分享已关闭或不存在。',404);
  res.writeHead(200,publicHeaders);res.end(growthHTML(publicGrowth(found[1].profile,await readState(found[0]))));
 },
 'POST /api/life/report':wrap(async(req,res,u)=>{
  const b=await readBody(req),db=getDB(),kind=b.kind,id=clean(b.id,100),reason=clean(b.reason,500);
  if(!['post','comment','user'].includes(kind)||!id||reason.length<2)return fail(res,'请选择对象并填写举报原因（2至500字）。');
  const post=db.posts.find(p=>!p.deleted&&(kind==='comment'?(p.comments||[]).some(c=>c.id===id&&!c.deleted):p.id===id));
  if(kind==='user'?!getMember(id):!post)return fail(res,'举报对象不存在。',404);
  const target=kind==='user'?id:kind==='comment'?post.comments.find(c=>c.id===id).uid:post.uid;
  if((db.blocks[u.id]||[]).includes(target)||(db.blocks[target]||[]).includes(u.id))return fail(res,'该对象不可见。',404);
  if(db.reports.filter(r=>r.from===u.id&&r.createdAt>Date.now()-86400000).length>=10)return fail(res,'今日举报已达10次，请明天再试。',429);
  const old=db.reports.find(r=>r.from===u.id&&r.kind===kind&&r.targetId===id&&r.status==='pending');if(old)return json(res,200,{ok:true,id:old.id});
  const report={id:crypto.randomUUID(),kind,targetId:id,postId:post?.id||null,target,from:u.id,reason,status:'pending',createdAt:Date.now(),history:[]};await commit(s=>s.reports.push(report));json(res,200,{ok:true,id:report.id});
 }),
 'GET /api/life/admin/reports':wrap(async(req,res,u)=>{
  if(!isAdmin(u))return fail(res,'仅管理员可查看。',403);const q=new URL(req.url,'http://local').searchParams,status=q.get('status')||'pending',before=Number(q.get('before'))||Infinity;
  const rows=getDB().reports.filter(r=>(status==='all'||r.status===status)&&r.createdAt<before).sort((a,b)=>b.createdAt-a.createdAt).slice(0,31);
  json(res,200,{reports:rows.slice(0,30),next:rows.length>30?rows[29].createdAt:null});
 }),
 'POST /api/life/admin/reports':wrap(async(req,res,u)=>{
  if(!isAdmin(u))return fail(res,'仅管理员可处理。',403);const b=await readBody(req),r=getDB().reports.find(x=>x.id===b.id),note=clean(b.note,500);
  if(!r)return fail(res,'举报不存在。',404);if(!['resolved','dismissed'].includes(b.status)||!note)return fail(res,'请选择处理结果并填写处理说明。');
  await commit(s=>{const report=s.reports.find(x=>x.id===r.id);report.status=b.status;report.history.push({by:u.id,status:b.status,note,at:Date.now()});if(b.removeContent===true&&b.status==='resolved'){const p=s.posts.find(p=>p.id===r.postId);if(p&&r.kind==='post')p.deleted=true;if(p&&r.kind==='comment'){const c=p.comments.find(c=>c.id===r.targetId);if(c)c.deleted=true}}});json(res,200,{ok:true});
 }),
 'POST /api/life/feedback':wrap(async(req,res,u)=>{
  const b=await readBody(req),text=clean(b.text,1000);if(text.length<2)return fail(res,'请填写2至1000字反馈。');
  if(getDB().feedback.filter(f=>f.from===u.id&&f.createdAt>Date.now()-86400000).length>=3)return fail(res,'今日已提交3条反馈，谢谢参与。',429);
  await commit(s=>s.feedback.push({id:crypto.randomUUID(),from:u.id,text,createdAt:Date.now(),status:'pending'}));json(res,200,{ok:true});
 }),
 'GET /api/life/admin/feedback':wrap(async(req,res,u)=>{if(!isAdmin(u))return fail(res,'仅管理员可查看。',403);json(res,200,{feedback:getDB().feedback.slice(-100).reverse()})})
 };
}
