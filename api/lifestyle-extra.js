import crypto from 'node:crypto';
export function notify(s, {to,from,kind,post, key}) {
  if(!to||to===from||(s.blocks[to]||[]).includes(from)||(s.blocks[from]||[]).includes(to))return;
  s.notifications ||= [];
  if(key&&s.notifications.some(n=>n.key===key&&n.to===to))return;
  s.people ||= {};s.people[to] ||= {profile:{},meals:[]};s.people[to].notificationVersion=crypto.randomUUID();
  s.notifications.push({id:crypto.randomUUID(),to,from,kind,post:post||null,key:key||null,createdAt:Date.now(),readAt:null});
  const own=s.notifications.filter(n=>n.to===to);if(own.length>500){const remove=new Set(own.slice(0,-500).map(n=>n.id));s.notifications=s.notifications.filter(n=>!remove.has(n.id));}
}
const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
export function extraRoutes({wrap,getDB,commit,person,publicPerson,visiblePost,json,readBody,readWorkouts,validDate,foodItems,text}){
 const fail=(res,error,status=400)=>json(res,status,{error});
 const blocked=(a,b)=>(getDB().blocks[a]||[]).includes(b)||(getDB().blocks[b]||[]).includes(a);
 const progress=async(c,uid)=>{
   let dates=c.kind==='training' ? (await readWorkouts(uid)).map(w=>w.d) : (getDB().people[uid]?.meals||[]).map(m=>m.date);
   dates=dates.filter(d=>validDate(d)&&d>=c.start&&d<=c.end&&d<=day());
   if(c.kind==='training')return dates.length;
   const sorted=[...new Set(dates)].sort();if(c.kind==='food-days')return sorted.length;
   let max=0,run=0,last;for(const d of sorted){run=last&&Date.parse(d)-Date.parse(last)===86400000?run+1:1;max=Math.max(max,run);last=d}return max;
 };
 const challenge=async(c,uid)=>({...c,members:undefined,joined:c.members.includes(uid),memberCount:c.members.length,
   participants:c.members.includes(uid)?await Promise.all(c.members.filter(id=>!blocked(uid,id)).map(async id=>({person:publicPerson(id),count:await progress(c,id)}))):[]});
 return {
  'GET /api/life/unread':wrap(async(req,res,u)=>{const db=getDB();if(db.people[u.id]?.notificationPrefs?.muted)return json(res,200,{total:0,messages:0,interactions:0});const messages=db.messages.filter(m=>m.to===u.id&&!m.readAt&&!blocked(u.id,m.from)).length,interactions=db.notifications.filter(n=>n.to===u.id&&!n.readAt&&n.kind!=='message'&&!blocked(u.id,n.from)&&(!n.post||visiblePost(n.post))).length;json(res,200,{total:messages+interactions,messages,interactions})}),
  'GET /api/life/notifications':wrap(async(req,res,u)=>{
   const db=getDB(),prefs=db.people[u.id]?.notificationPrefs||{};
   const list=db.notifications.filter(n=>n.to===u.id&&!blocked(u.id,n.from)&&(!n.post||visiblePost(n.post))).slice().reverse();
   const readThrough={notification:db.notifications.filter(n=>n.to===u.id).at(-1)?.id||null,message:db.messages.filter(m=>m.to===u.id).at(-1)?.id||null};
   const q=new URL(req.url,'http://local').searchParams,[time,id='']=(q.get('before')||'').split(':'),cut=Number(time)||Infinity,limit=Math.max(1,Math.min(50,Math.trunc(Number(q.get('limit'))||50)));
   const page=list.filter(n=>n.createdAt<cut||(n.createdAt===cut&&n.id<id)).sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id)).slice(0,limit+1);
   json(res,200,{readThrough,items:page.slice(0,limit).map(n=>({...n,to:undefined,key:undefined,author:publicPerson(n.from)})),next:page.length>limit?`${page[limit-1].createdAt}:${page[limit-1].id}`:null,unread:prefs.muted?0:list.filter(n=>!n.readAt).length,prefs});
  }),
  'POST /api/life/notifications/read':wrap(async(req,res,u)=>{
   const {id,all,through}=await readBody(req);const db=getDB();
   // A receipt acknowledges only the snapshot opened by this member, never later arrivals.
   let notificationEnd=-1,messageEnd=-1;
   if(through!==undefined){
    if(!through||typeof through!=='object'||Array.isArray(through))return fail(res,'无效的已读位置。');
    for(const [field,rows] of [['notification',db.notifications],['message',db.messages]]){
     if(through[field]==null)continue;
     const index=rows.findIndex(n=>n.id===through[field]&&n.to===u.id);
     if(index<0)return fail(res,'已读位置已更新，请刷新后重试。');
     if(field==='notification')notificationEnd=index;else messageEnd=index;
    }
   }
   await commit(s=>{const at=Date.now();s.notifications.forEach((n,i)=>{if(n.to===u.id&&!n.readAt&&(all===true||n.id===id||(through&&i<=notificationEnd)))n.readAt=at});s.messages.forEach((m,i)=>{if(m.to===u.id&&!m.readAt&&(all===true||(through&&i<=messageEnd)))m.readAt=at})});json(res,200,{ok:true});
  }),
  'PUT /api/life/notifications/prefs':wrap(async(req,res,u)=>{
   const {muted}=await readBody(req);await commit(s=>{person(s,u.id).notificationPrefs={muted:muted===true}});json(res,200,{ok:true});
  }),
  'POST /api/life/bookmark':wrap(async(req,res,u)=>{
   const {id,saved}=await readBody(req),p=visiblePost(id);if(!p||blocked(u.id,p.uid))return fail(res,'动态不可用。',404);
   await commit(s=>{s.bookmarks[u.id]=[...(s.bookmarks[u.id]||[]).filter(x=>x!==id),...(saved===true?[id]:[])]});json(res,200,{ok:true});
  }),
  'GET /api/life/challenges':wrap(async(req,res,u)=>{json(res,200,{challenges:await Promise.all(getDB().challenges.filter(c=>!blocked(u.id,c.owner)).slice().reverse().slice(0,100).map(c=>challenge(c,u.id))),today:day()})}),
  'POST /api/life/challenge':wrap(async(req,res,u)=>{
   const b=await readBody(req),title=text(b.title,60),target=Number(b.target);
   if(!title||!['training','food-days','food-streak'].includes(b.kind)||!validDate(b.start)||!validDate(b.end)||b.end<b.start||Date.parse(b.end)-Date.parse(b.start)>30*86400000||!Number.isInteger(target)||target<1||target>30)return fail(res,'请设置有效名称、类型、1～30 的目标和最多31天的日期范围。');
   if(b.kind!=='training'&&target>1+(Date.parse(b.end)-Date.parse(b.start))/86400000)return fail(res,'记录天数目标不能超过挑战天数。');
   if(getDB().challenges.filter(c=>c.owner===u.id&&!c.closed).length>=10)return fail(res,'最多同时创建10个挑战。');
   const c={id:crypto.randomUUID(),title,kind:b.kind,target,start:b.start,end:b.end,owner:u.id,members:[u.id],createdAt:Date.now(),closed:false};await commit(s=>s.challenges.push(c));json(res,200,{challenge:await challenge(c,u.id)});
  }),
  'POST /api/life/challenge/join':wrap(async(req,res,u)=>{
   const {id,join}=await readBody(req),c=getDB().challenges.find(c=>c.id===id);if(!c||blocked(u.id,c.owner))return fail(res,'挑战不存在。',404);
   if(join===true&&(c.closed||c.end<day()))return fail(res,'挑战已结束或关闭。');
   if(join===true&&c.members.length>=50&&!c.members.includes(u.id))return fail(res,'挑战最多50人。');
   await commit(s=>{const x=s.challenges.find(x=>x.id===id);x.members=[...x.members.filter(x=>x!==u.id),...(join===true?[u.id]:[])]});json(res,200,{ok:true});
  }),
  'POST /api/life/challenge/close':wrap(async(req,res,u)=>{
   const {id}=await readBody(req),c=getDB().challenges.find(c=>c.id===id);if(!c||c.owner!==u.id)return fail(res,'只有创建者可以关闭挑战。',403);await commit(s=>{s.challenges.find(c=>c.id===id).closed=true});json(res,200,{ok:true});
  }),
  'POST /api/life/restore':wrap(async(req,res,u)=>{
   const b=await readBody(req);if(b.type!=='opengym-lifestyle'||b.version!==2||!Array.isArray(b.meals)||!Array.isArray(b.templates)||b.meals.length>3000||b.templates.length>100)return fail(res,'备份格式或数量不正确。');
   const meals=[];for(const m of b.meals){const items=foodItems(m?.items);if(!items||!validDate(m.date)||!['breakfast','lunch','dinner','snack'].includes(m.type))return fail(res,'备份中存在无效饮食，未导入任何记录。');meals.push({id:typeof m.id==='string'&&m.id?m.id.slice(0,80):crypto.randomUUID(),date:m.date,type:m.type,items,note:text(m.note,500),photo:'',source:m.source==='ai-reviewed'?'ai-reviewed':'manual',mealStyle:'unknown',createdAt:Date.now(),updatedAt:Date.now()});}
   const templates=[];for(const t of b.templates){const items=foodItems(t?.items);if(!items||!text(t.name,60)||!['breakfast','lunch','dinner','snack'].includes(t.type))return fail(res,'备份中存在无效常吃餐，未导入任何记录。');templates.push({id:typeof t.id==='string'&&t.id?t.id.slice(0,80):crypto.randomUUID(),name:text(t.name,60),items,type:t.type,note:text(t.note,500),source:'manual',updatedAt:Date.now()});}
   const old=getDB().people[u.id]||{meals:[],templates:[]};if(new Set(meals.map(m=>m.id)).size!==meals.length||new Set(templates.map(t=>t.id)).size!==templates.length)return fail(res,'备份中含重复记录标识，未导入。');
   const add=meals.filter(m=>!old.meals.some(x=>x.id===m.id));const addT=templates.filter(t=>!(old.templates||[]).some(x=>x.id===t.id));
   if(old.meals.length+add.length>30000||(old.templates||[]).length+addT.length>100)return fail(res,'导入后记录数量将超过上限。');
   await commit(s=>{const p=person(s,u.id);p.meals=[...p.meals,...add];p.templates=[...(p.templates||[]),...addT]});json(res,200,{meals:add.length,templates:addT.length});
  }),
 };
}
