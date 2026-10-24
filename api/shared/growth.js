import {hasCompletedWork,isWarmupRow} from '../../frontend/src/lib/workout-model.js';
export const goals={habit:'建立习惯',strength:'提升力量',gain:'增肌',loss:'减脂',maintain:'保持状态'};
export const experiences={beginner:'刚开始训练',returning:'恢复训练',regular:'已有规律训练'};
export const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
export const effectiveWorkout=w=>!!w&&validDay(w.d)&&Array.isArray(w.entries)&&w.entries.some(e=>e&&Array.isArray(e.sets)&&e.sets.some(s=>s&&!isWarmupRow(s)&&hasCompletedWork(s)&&[s,s.sides?.L,s.sides?.R].some(x=>x&&[x.r,x.sec,x.min].some(n=>Number(n)>0))));
export const effectiveMeal=m=>!!m&&validDay(m.date)&&Array.isArray(m.items)&&m.items.some(x=>typeof x?.name==='string'&&x.name.trim()&&Number.isFinite(x.calories)&&x.calories>=0);
export function growthSummary(state={},today=new Date(Date.now()+8*3600000).toISOString().slice(0,10)){
 const seen=new Set(),workouts=(state?.workouts||[]).filter(effectiveWorkout).filter(w=>{if(!w.id)return true;if(seen.has(w.id))return false;seen.add(w.id);return true}),dates=[...new Set(workouts.map(w=>w.d))].sort();
 const end=Date.parse(today),start=end-27*86400000;
 const recent=dates.filter(d=>Date.parse(d)>=start&&Date.parse(d)<=end);
 const weeks=Array.from({length:4},(_,i)=>{const from=end-(27-i*7)*86400000,to=from+6*86400000;return {from:new Date(from).toISOString().slice(0,10),days:recent.filter(d=>Date.parse(d)>=from&&Date.parse(d)<=to).length}});
 const total=workouts.length,milestones=[1,5,10,25,50,100,250,500,1000];
 return {total,trainingDays:dates.length,lastTraining:dates.at(-1)||null,recentDays:recent.length,weeks,milestone:milestones.filter(n=>n<=total).at(-1)||null,nextMilestone:milestones.find(n=>n>total)||null};
}
// A public response is built from allowed scalar fields; never spread a member document.
export function publicGrowth(profile={},state={}){
 const fields=profile.externalShare?.fields||[],out={};
 if(fields.includes('nickname'))out.nickname=profile.nickname||'健身伙伴';
 if(fields.includes('goal'))out.goal=goals[profile.trainingGoal||profile.fitnessGoal]||goals.habit;
 if(fields.includes('growth'))out.growth=growthSummary(state);
 return out;
}
export function growthHTML(data){
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const g=data.growth;
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>健身成长档案 · OpenGym</title><style>body{font:18px/1.7 system-ui;background:#f5f7fb;color:#182433;margin:0;padding:24px}main{max-width:640px;margin:8vh auto;background:white;border-radius:24px;padding:32px}h1{font-size:32px}strong{color:#087840}a{color:#005bcc}</style><main><p>OpenGym · 主动分享的成长档案</p><h1>${escape(data.nickname||'健身伙伴')}</h1>${data.goal?`<p>当前目标：${escape(data.goal)}</p>`:''}${g?`<p>累计 <strong>${g.total}</strong> 次有效训练 · ${g.trainingDays} 个训练日</p><p>最近四周：${g.recentDays} 个训练日</p><p>${g.milestone?`已完成 ${g.milestone} 次训练里程碑`:'从第一条记录开始'}</p>`:''}<p>仅展示作者选择的内容。训练次数来自保存的已完成工作组，身体资料、餐食和私信不会出现在此页。</p><a href="/">登录 OpenGym，与伙伴交流进步 →</a></main></html>`;
}
