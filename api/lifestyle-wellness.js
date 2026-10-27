import crypto from 'node:crypto';
const text=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const amount=(v,max=15000)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
export function nutritionConfig(input){
 if(!input||!['fixed','training-rest','weekly'].includes(input.mode)||!date(input.start))return null;
 const keys=input.mode==='fixed'?['daily']:input.mode==='training-rest'?['training','rest']:['0','1','2','3','4','5','6'];
 const targets={};for(const k of keys){const row=input.targets?.[k];if(!row||!amount(row.calories)||!['protein','carbs','fat'].every(f=>row[f]===null||amount(row[f],2000)))return null;targets[k]=Object.fromEntries(['calories','protein','carbs','fat'].map(f=>[f,row[f]]))}
 return {mode:input.mode,start:input.start,targets,...(['loss','gain','shape','health'].includes(input.direction)?{direction:input.direction,program:text(input.program,40),title:text(input.title,80)}:{})};
}
export async function reportLayout(summary,config,fetcher=fetch){
 const safe=Object.fromEntries(['workouts','trainingDays','minutes','sets','foodDays','meals','weightDays'].map(k=>[k,amount(summary?.[k],1000000)?summary[k]:0]));
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),30000);
 try{const res=await fetcher((config.FOOD_AI_BASE_URL||'https://api.deepseek.com').replace(/\/$/,'')+'/chat/completions',{method:'POST',signal:ctl.signal,headers:{Authorization:'Bearer '+config.FOOD_AI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:config.FOOD_AI_MODEL||'deepseek-flash',thinking:{type:'disabled'},response_format:{type:'json_object'},max_tokens:180,messages:[{role:'system',content:'你是运动周报排版师。数据仅为记录数量，不能评价身体、推测努力程度或改写数字。只返回JSON，layout选sport或editorial，palette选blue或green或orange，headline选每一组都算数或把进步留在这一周或认真记录慢慢进步。按现有数据选择适合突出训练或记录习惯的版式，不输出HTML。'},{role:'user',content:JSON.stringify(safe)}]})});if(!res.ok)throw Error('AI 服务暂不可用');const body=await res.json(),out=JSON.parse(String(body.choices?.[0]?.message?.content).replace(/^```(?:json)?\s*|\s*```$/g,''));return {layout:['sport','editorial'].includes(out.layout)?out.layout:'sport',palette:['blue','green','orange'].includes(out.palette)?out.palette:'blue',headline:['每一组都算数','把进步留在这一周','认真记录慢慢进步'].includes(out.headline)?out.headline:'每一组都算数'};}finally{clearTimeout(timer)}
}
export function wellnessRoutes({wrap,getDB,commit,person,json,readBody,aiConfig,reserveAI}){
 const fail=(res,error,status=400)=>json(res,status,{error});
 return {
 'POST /api/life/checkin':wrap(async(req,res,u)=>{
  const b=await readBody(req),photo=text(b.photo,120),place=text(b.place,100),clientId=text(b.clientId,80),p=getDB().people[u.id]||{};
  if(!clientId||(!photo&&!place))return fail(res,'请拍一张训练照片，或填写打卡地点。');
  if(photo&&(!getDB().assets[photo]?.mime.startsWith('image/')||getDB().assets[photo]?.owner!==u.id))return fail(res,'请选择自己的照片。');
  const old=(p.checkins||[]).find(x=>x.clientId===clientId);
  if(!old&&(p.checkins||[]).filter(x=>x.at>Date.now()-86400000).length>=10)return fail(res,'每天最多保存10次打卡。',429);
  if(!old&&(p.checkins||[]).length>=3650)return fail(res,'打卡已达3650条，请先导出备份。');
  let location=null;if(b.location){const {lat,lon}=b.location;if(!amount(lat+90,180)||!amount(lon+180,360))return fail(res,'地点坐标不正确。');location={lat:Math.round(lat*1000000)/1000000,lon:Math.round(lon*1000000)/1000000};if(!place)return fail(res,'请填写地点名称。')}
  if(old){if((old.note||'')!==text(b.note,240)||old.photo!==photo||old.place!==place||JSON.stringify(old.location)!==JSON.stringify(location))return fail(res,'这次打卡已保存，但内容不同。请刷新核对后再新增，当前输入仍保留。',409);return json(res,200,{checkin:old})}
  const checkin={id:crypto.randomUUID(),clientId,photo,place,location,note:text(b.note,240),at:Date.now(),source:'self-reported'};
  await commit(s=>{const p=person(s,u.id);p.checkins=[...(p.checkins||[]),checkin]});json(res,200,{checkin});
 }),
 'PUT /api/life/nutrition-config':wrap(async(req,res,u)=>{const b=await readBody(req),config=nutritionConfig(b),old=getDB().people[u.id]?.nutritionConfig;if(!config)return fail(res,'请检查计划日期与热量、营养素目标。');if(b.baseVersion!==(old?.version||0))return fail(res,'计划已更新，请刷新后再保存。',409);if((getDB().people[u.id]?.nutritionHistory||[]).length>=365)return fail(res,'已保存365次计划版本，请先导出备份。');config.version=Math.max(Date.now(),(old?.version||0)+1);await commit(s=>{const p=person(s,u.id);p.nutritionHistory=[...(p.nutritionHistory||[]),...(p.nutritionConfig?[p.nutritionConfig]:[])];p.nutritionConfig=config});json(res,200,{nutritionConfig:config});}),
 'POST /api/life/food':wrap(async(req,res,u)=>{const b=await readBody(req),name=text(b.name,80),id=b.id?text(b.id,80):crypto.randomUUID(),foods=getDB().people[u.id]?.foods||[];if(!name||!amount(b.calories,2000)||!['protein','carbs','fat'].every(k=>b[k]===null||amount(b[k],100)))return fail(res,'请填写名称和每100克的有效营养数据。');if(b.id&&!foods.some(f=>f.id===id))return fail(res,'食物不存在。',404);if(b.id&&b.updatedAt!==foods.find(f=>f.id===id).updatedAt)return fail(res,'食物已在其他页面更新，请刷新后再编辑。',409);if(!b.id&&foods.length>=500)return fail(res,'最多保存500种自定义食物。');const food={id,name,category:['protein','carbs','fat','other'].includes(b.category)?b.category:'other',calories:b.calories,protein:b.protein,carbs:b.carbs,fat:b.fat,updatedAt:Date.now(),source:'manual-per100g'};await commit(s=>{const p=person(s,u.id);p.foods=[...(p.foods||[]).filter(f=>f.id!==id),food]});json(res,200,{food});}),
 'DELETE /api/life/food':wrap(async(req,res,u)=>{const b=await readBody(req);await commit(s=>{const p=person(s,u.id);p.foods=(p.foods||[]).filter(f=>f.id!==b.id)});json(res,200,{ok:true});}),
 'POST /api/life/report-layout':wrap(async(req,res,u)=>{const b=await readBody(req);if(b.consent!==true)return fail(res,'请确认仅发送周报汇总数字。');if(!aiConfig.FOOD_AI_API_KEY)return fail(res,'AI 尚未配置，可直接使用免费模板。',503);const key='poster:'+u.id+':'+new Date().toISOString().slice(0,10);if((getDB().aiUsage[key]||0)>=5)return fail(res,'今日AI编排已达5次，免费模板仍可使用。',429);await reserveAI(key);try{json(res,200,{design:await reportLayout(b.summary,aiConfig)})}catch{return fail(res,'AI编排暂不可用，原数据保留，请使用免费模板。',502)}})
 };
}
