import crypto from 'node:crypto';
export const activeStatus = (status,now=Date.now()) => status && status.expiresAt>now ? {emoji:status.emoji,text:status.text,expiresAt:status.expiresAt} : null;
const txt=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
export function nextRoutes({wrap,getDB,commit,person,json,readBody,isAdmin,foodItems,validDate,serviceConfig}){
 const fail=(res,error,status=400)=>json(res,status,{error});
 const config=serviceConfig||{read:async()=>getDB().siteSettings?.location||{},write:async value=>commit(s=>{s.siteSettings||={};s.siteSettings.location=value})};
 return {
  'PUT /api/life/status':wrap(async(req,res,u)=>{
   const b=await readBody(req);if(b.clear!==true&&(!txt(b.text,60)||!txt(b.emoji,12)))return fail(res,'请选择或写一个状态。');
   const value=b.clear?null:{emoji:txt(b.emoji,12),text:txt(b.text,60),expiresAt:Date.now()+86400000};
   await commit(s=>{const p=person(s,u.id);p.profile.currentStatus=value;p.profile.version=Math.max(Date.now(),(p.profile.version||0)+1);p.profile.updatedAt=Date.now()});
   json(res,200,{profile:getDB().people[u.id].profile});
  }),
  'POST /api/life/meal-plan':wrap(async(req,res,u)=>{
   const b=await readBody(req),items=foodItems(b.items),plans=getDB().people[u.id]?.mealPlans||[];
   if(!validDate(b.date)||!['breakfast','lunch','dinner','snack'].includes(b.type)||!items)return fail(res,'请确认日期、餐次和食物份量。');
   if(b.id&&!plans.some(p=>p.id===b.id))return fail(res,'安排不存在。',404);
   const old=plans.find(p=>p.id===b.id);if(old&&b.version!==old.version)return fail(res,'这份安排已更新，请刷新后再编辑。',409);
   if(!b.id&&plans.length>=1000)return fail(res,'饮食安排已达1000条，请先整理历史安排。');
   const plan={id:b.id||crypto.randomUUID(),date:b.date,type:b.type,items,note:txt(b.note,500),version:Math.max(Date.now(),(old?.version||0)+1)};
   await commit(s=>{const p=person(s,u.id);p.mealPlans=[...(p.mealPlans||[]).filter(x=>x.id!==plan.id),plan]});json(res,200,{plan});
  }),
  'DELETE /api/life/meal-plan':wrap(async(req,res,u)=>{const b=await readBody(req);await commit(s=>{const p=person(s,u.id);p.mealPlans=(p.mealPlans||[]).filter(x=>x.id!==b.id)});json(res,200,{ok:true});}),
  'POST /api/life/meal-plan/record':wrap(async(req,res,u)=>{
   const b=await readBody(req),p=getDB().people[u.id]||{},plan=(p.mealPlans||[]).find(x=>x.id===b.id),old=(p.meals||[]).find(m=>m.clientId==='planned-'+b.id);
   if(old)return json(res,200,{meal:old,planId:b.id});if(!plan)return fail(res,'安排不存在。',404);if(b.version!==plan.version)return fail(res,'这份安排已更新，请核对后再记录。',409);
   if(plan.date>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}))return fail(res,'未来安排不能计入已吃记录。');
   const meal={id:crypto.randomUUID(),clientId:'planned-'+plan.id,date:plan.date,type:plan.type,items:plan.items,note:plan.note,photo:'',source:'manual',mealStyle:'unknown',createdAt:Date.now(),updatedAt:Date.now()};
   await commit(s=>{const p=person(s,u.id);p.meals=[...(p.meals||[]),meal];p.mealPlans=(p.mealPlans||[]).filter(x=>x.id!==plan.id)});json(res,200,{meal,planId:plan.id});
  }),
  'GET /api/life/location-config':wrap(async(req,res)=>{const c=await config.read()||{};json(res,200,{configured:!!c.key,provider:'amap'});}),
  'GET /api/life/admin/location-config':wrap(async(req,res,u)=>{if(!isAdmin(u))return fail(res,'仅管理员可配置。',403);const c=await config.read()||{};json(res,200,{configured:!!c.key,provider:'amap'});}),
  'PUT /api/life/admin/location-config':wrap(async(req,res,u)=>{if(!isAdmin(u))return fail(res,'仅管理员可配置。',403);const b=await readBody(req);if(b.clear!==true&&!/^[a-zA-Z0-9_-]{16,128}$/.test(b.key||''))return fail(res,'请填写有效的高德 Web 服务 Key。');await config.write({key:b.clear?'':b.key,updatedAt:Date.now()});json(res,200,{configured:!b.clear,provider:'amap'});}),
  'POST /api/life/location/resolve':wrap(async(req,res)=>{
   const b=await readBody(req);if(b.consent!==true||!Number.isFinite(b.lat)||Math.abs(b.lat)>90||!Number.isFinite(b.lon)||Math.abs(b.lon)>180)return fail(res,'请确认本次位置查询。');
   const c=await config.read()||{};if(!c.key)return fail(res,'地点查询尚未配置，暂时可以手动填写地点。',503);
   const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10000);
   const call=async(path,args)=>{const response=await fetch('https://restapi.amap.com/v3/'+path+'?'+new URLSearchParams({key:c.key,...args}),{signal:ctl.signal,redirect:'error'});if(!response.ok)throw Error();const data=await response.json();if(data.status!=='1')throw Error();return data};
   try{
    // Browser geolocation uses WGS84; AMap reverse geocoding expects GCJ-02.
    const converted=await call('assistant/coordinate/convert',{locations:`${b.lon},${b.lat}`,coordsys:'gps'});
    if(!/^-?[\d.]+,-?[\d.]+$/.test(converted.locations||''))throw Error();
    const data=await call('geocode/regeo',{location:converted.locations,extensions:'all',radius:'1000',roadlevel:'0'}),r=data.regeocode||{};
    json(res,200,{address:txt(r.formatted_address,200),places:(r.pois||[]).slice(0,12).map(p=>({id:txt(p.id,100),name:txt(p.name,100),address:typeof p.address==='string'?txt(p.address,200):'',distance:Number(p.distance)||0})),provider:'高德地图'});
   }catch{return fail(res,'暂时无法取得地点名称，请稍后重试或手动填写。',502)}finally{clearTimeout(timer)}
  }),
 };
}
