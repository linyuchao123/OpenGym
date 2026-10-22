import catalogue from './plan-exercises.json' with {type:'json'}
export const planExercises=catalogue
export function allowedExercises(intake){const eq=new Set(['body weight',...(intake.equipment||[])]);return planExercises.filter(e=>eq.has(e.equipment))}
export function validateIntake(i){
 if(!i||i.adult!==true||!['home','gym','outdoor'].includes(i.place)||!['beginner','regular','experienced'].includes(i.experience)||!Array.isArray(i.days)||i.days.length<1||i.days.length>6||new Set(i.days).size!==i.days.length||i.days.some(d=>!Number.isInteger(d)||d<0||d>6)||!Array.isArray(i.equipment)||i.equipment.some(e=>!['dumbbell','barbell','cable','leverage machine','sled machine'].includes(e))||!Number.isFinite(i.minutes)||i.minutes<15||i.minutes>120)throw Error('请完整填写成人确认、训练地点、经验、器材和每周安排（1～6天）。')
 return {adult:true,place:i.place,experience:i.experience,days:i.days,minutes:i.minutes,equipment:i.equipment,goal:['gain','loss','recomp','maintain','unsure'].includes(i.goal)?i.goal:'unsure',focus:String(i.focus||'均衡发展').slice(0,100),usualParts:String(i.usualParts||'').slice(0,160),limitations:String(i.limitations||'').slice(0,300)}
}
export function validateFitnessPlan(p,intake){
 const allowed=new Set(allowedExercises(intake).map(e=>e.id));
 if(!p||!['gain','loss','recomp','maintain'].includes(p.direction)||typeof p.summary!=='string'||!p.summary.trim()||!Array.isArray(p.sessions)||p.sessions.length!==intake.days.length)throw Error('AI计划格式不完整，请重新生成。')
 const seen=new Set();
 const sessions=p.sessions.map(s=>{if(!intake.days.includes(s.day)||seen.has(s.day)||!Array.isArray(s.exercises)||s.exercises.length<2||s.exercises.length>8)throw Error('计划的训练日或动作数量不正确。');seen.add(s.day);const total=s.exercises.reduce((n,e)=>n+(Number(e.sets)||0),0);if(total>(intake.experience==='beginner'?20:30))throw Error('单次训练量过高，请减少组数后再确认。');const used=new Set();return {day:s.day,name:String(s.name||'力量训练').slice(0,40),exercises:s.exercises.map(e=>{if(!allowed.has(e.id)||used.has(e.id)||!Number.isInteger(e.sets)||e.sets<1||e.sets>5||!Number.isInteger(e.reps)||e.reps<5||e.reps>25||!Number.isInteger(e.restSec)||e.restSec<30||e.restSec>180)throw Error('计划包含不支持的动作、器材或训练参数。');used.add(e.id);return {id:e.id,sets:e.sets,reps:e.reps,restSec:e.restSec,note:String(e.note||'').slice(0,180)}})}})
 sessions.sort((a,b)=>(a.day||7)-(b.day||7));
 return {direction:p.direction,summary:p.summary.slice(0,1200),guidance:String(p.guidance||'从轻重量和可控动作开始，出现疼痛时停止。').slice(0,1200),sessions}
}
// Add fresh routines and assign the approved week. Never delete old routines or history.
export function installFitnessPlan(state,plan,intake,token){
 const valid=validateFitnessPlan(plan,intake);if(state.aiPlanApplied===token)return false
 if(state.active)throw Error('请先结束或取消正在进行的训练，再应用新计划。')
 if(state.queue)throw Error('当前有轮换队列，请先在计划中切回固定周，再应用AI计划。')
 const stamp=Date.now();state.aiPlanUndo={week:structuredClone(state.week),scheduleMode:state.scheduleMode,appliedToken:token,added:[]};
 state.routines||=[];state.week=Object.fromEntries(Array.from({length:7},(_,d)=>[d,[]]));
 for(const [i,s] of valid.sessions.entries()){const id='ai-'+token+'-'+i;state.routines.push({id,name:s.name,emoji:'dumbbell',prog:'off',notes:valid.guidance,aiSource:token,ex:s.exercises.map(e=>({id:e.id,sets:e.sets,reps:e.reps,weight:0,restSec:e.restSec,note:e.note}))});state.week[s.day]=[id];state.aiPlanUndo.added.push(id)}
 state.scheduleMode='week';state.aiPlanApplied=token;state.aiPlanAppliedAt=stamp;return true
}
