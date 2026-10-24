import {effectiveWorkout,effectiveMeal} from './growth.js';
const DAY=86400000;
const day=t=>new Date(t+8*3600000).toISOString().slice(0,10);
// Aggregate only. No profile, meal, body, or message content leaves this function.
export function usageMetrics(users,states,people,now=Date.now(),includeGroups=true){
 const week=now-7*DAY;let activated=0,eligible24=0,d7=0,eligibleD7=0,weekly=0,consistent=0;
 for(const u of users){
  const created=Date.parse(u.created),w=(states[u.id]?.workouts||[]).filter(effectiveWorkout),m=(people[u.id]?.meals||[]).filter(effectiveMeal);
  // Historical records without trustworthy save timestamps do not prove activation/retention.
  const times=[...w.map(x=>x.savedAt||x.end),...m.map(x=>x.createdAt)].filter(t=>Number.isFinite(t)&&t>=created&&t<=now);
  if(created<=now-DAY){eligible24++;if(times.some(t=>t<created+DAY))activated++}
  if(created<=now-8*DAY){eligibleD7++;if(times.some(t=>day(t)===day(created+7*DAY)))d7++}
  const days=new Set(times.filter(t=>t>=week).map(day));if(days.size)weekly++;if(days.size>=2)consistent++;
 }
 const rate=(n,d)=>({count:n,eligible:d,rate:d?n/d:null});
 const groups={};if(includeGroups)for(const [name,field] of [['goal','trainingGoal'],['experience','experience']]){const keys=[...new Set(users.map(u=>people[u.id]?.profile?.[field]||(field==='trainingGoal'?people[u.id]?.profile?.fitnessGoal:null)||'unknown'))];groups[name]=keys.map(key=>({key,...usageMetrics(users.filter(u=>(people[u.id]?.profile?.[field]||(field==='trainingGoal'?people[u.id]?.profile?.fitnessGoal:null)||'unknown')===key),states,people,now,false)}))}
 return {...(includeGroups?{groups}:{}),asOf:now,registered:users.length,activation24h:rate(activated,eligible24),weeklyEffective:weekly,consistentWeekly:consistent,d7Effective:rate(d7,eligibleD7),method:'按北京时间统计；仅含现存有效记录及其保存/完成时间。历史缺失时间、导入与删除会影响统计，不能当作完整事件埋点。'};
}

// Server-owned first effective-save stamp; retries and edits cannot move it to a later day.
export function stampEffectiveSaves(previous,state,now=Date.now()){
 const key=w=>w.id??`${w.d}|${w.start}`;
 const old=new Map((previous?.workouts||[]).filter(Boolean).map(w=>[key(w),w]));
 for(const w of state.workouts||[]){const prior=old.get(key(w));delete w.savedAt;if(prior?.savedAt)w.savedAt=prior.savedAt;else if(effectiveWorkout(w)&&!effectiveWorkout(prior))w.savedAt=now}
}

export function communityMetrics(posts=[],people={},now=Date.now()){
 const since=now-7*DAY,shared=new Set(),commented=new Set(),received=new Set();
 for(const p of posts){if(p.deleted)continue;if(p.createdAt>=since)shared.add(p.uid);for(const c of p.comments||[])if(!c.deleted&&c.uid!==p.uid&&c.createdAt>=since&&typeof c.text==='string'&&c.text.trim().length>=2){commented.add(c.uid);received.add(p.uid)}}
 return {profileUpdates:Object.values(people).filter(p=>p.profile?.updatedAt>=since).length,sharingUsers:shared.size,commentingUsers:commented.size,receivedComments:received.size,definition:'近7天，评论为非本人、至少2字、未删除的评论；不采集私信。身体资料同步也可能更新主页时间。'};
}
