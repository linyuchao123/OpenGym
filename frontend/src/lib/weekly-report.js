import { isoDate, nutritionPeriod, totals } from './nutrition.js'
import { workoutDay, workoutDuration, workoutVolume, workSetsDone } from './history.js'

const safe = value => Number.isFinite(Number(value)) ? Number(value) : 0
export const roundReport = n => Math.round(n*10)/10
export function shiftReportWeek(date, offset) {
  const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate()+offset*7); return isoDate(d)
}
function summarize(S, meals, date) {
  const { start, end } = nutritionPeriod(date, 'week')
  const workouts = (S.workouts || []).filter(w => { const day = workoutDay(w); return day && day >= start && day < end })
  const food = (meals || []).filter(m => m.date >= start && m.date < end)
  const foodDays = new Set(food.map(m=>m.date)).size
  const intake = totals(food)
  const proteinDays=new Set(food.filter(m=>(m.items||[]).some(i=>i.protein!=null&&i.protein!==''&&Number.isFinite(Number(i.protein)))).map(m=>m.date)).size
  const weightsByDay = new Map()
  for (const x of S.bodyweight || []) {
    if (x.d >= start && x.d < end && safe(x.w) > 0) {
      const previous = weightsByDay.get(x.d)
      if (!previous || safe(x.t) >= safe(previous.t)) weightsByDay.set(x.d,x)
    }
  }
  const weights = [...weightsByDay.values()].sort((a,b)=>a.d.localeCompare(b.d))
  const last = new Date(`${end}T12:00:00`);last.setDate(last.getDate()-1)
  const days = Array.from({length:7},(_,i)=>{
    const d = new Date(`${start}T12:00:00`);d.setDate(d.getDate()+i);const key=isoDate(d)
    const trained=workouts.filter(w=>workoutDay(w)===key)
    const eaten=food.filter(m=>m.date===key)
    return { date:key,label:['周日','周一','周二','周三','周四','周五','周六'][d.getDay()],workouts:trained.length,
      sets:trained.reduce((s,w)=>s+workSetsDone(w),0),volume:roundReport(trained.reduce((s,w)=>s+workoutVolume(w),0)),
      weight:weightsByDay.get(key)?.w??null,protein:eaten.some(m=>(m.items||[]).some(i=>i.protein!=null&&i.protein!==''))?roundReport(totals(eaten).protein):null,carbs:eaten.length?roundReport(totals(eaten).carbs):null,fat:eaten.length?roundReport(totals(eaten).fat):null,
      minutes:roundReport(trained.reduce((s,w)=>s+workoutDuration(w),0)/60000),
      meals:eaten.length,calories:eaten.length?roundReport(totals(eaten).calories):null }
  })
  return { trainingNames: [...new Set(workouts.map(w=>w.name||'未命名训练'))],recordIds:[...new Set(workouts.flatMap(w=>Array.isArray(w.prs)?w.prs:[]))],start,end,last:isoDate(last),days,workouts:workouts.length,trainingDays:new Set(workouts.map(workoutDay)).size,
    completedDays:new Set(workouts.filter(w=>workSetsDone(w)>0).map(workoutDay)).size,
    minutes:roundReport(workouts.reduce((s,w)=>s+workoutDuration(w),0)/60000),
    missingDuration:workouts.filter(w=>workoutDuration(w)<=0).length,
    sets:workouts.reduce((s,w)=>s+workSetsDone(w),0),
    // Recompute from completed rows: cached volume can be stale after editing old sessions.
    volume:roundReport(workouts.reduce((s,w)=>s+workoutVolume(w),0)),
    prs:workouts.reduce((s,w)=>s+new Set(w.prs||[]).size,0),
    meals:food.length,foodDays,intake,averageCalories:foodDays?roundReport(intake.calories/foodDays):null,
    proteinDays,averageProtein:proteinDays?roundReport(intake.protein/proteinDays):null,
    weightDays:weights.length,firstWeight:weights[0]||null,lastWeight:weights.at(-1)||null,
    weightDelta:weights.length>1?roundReport(weights.at(-1).w-weights[0].w):null,
  }
}
export function weeklyReport(S, meals, date) {
  const current=summarize(S,meals,date)
  const previous=summarize(S,meals,shiftReportWeek(current.start,-1))
  return { ...current,previous,workoutDelta:current.workouts-previous.workouts,
    calorieDelta:current.foodDays&&previous.foodDays?roundReport(current.averageCalories-previous.averageCalories):null,
    unit:S.unit==='lb'?'lb':'kg' }
}
export function reportText(r,{includeWeight=true,includeFood=true}={}) {
  return [
    'OpenGym | 我的运动周刊',`${r.start} 至 ${r.last}`,'══════════════════════════════','',
    '01 / 训练足迹',`训练记录：${r.workouts} 次，覆盖 ${r.trainingDays} 天`,
    r.trainingNames?.length?`本周训练：${r.trainingNames.join('、')}`:'本周还没有训练记录，不推断实际运动量。',
    r.recordNames?.length?`新纪录动作：${r.recordNames.join('、')}`:'本周没有新标记的个人纪录；这不代表没有进步。',
    `已记录训练时长：${r.minutes} 分钟${r.missingDuration?`（${r.missingDuration} 次训练缺少时长）`:''}`,
    `完成工作组：${r.sets} 组`, `训练容量：${r.volume} ${r.unit}·次`,
    `训练记录较上周：${r.workoutDelta>=0?'+':''}${r.workoutDelta} 次`,'',
    ...(includeFood?['02 / 饮食记录',`饮食记录：${r.meals} 餐，覆盖 ${r.foodDays}/7 天`,
    r.averageCalories===null?'日均热量：暂无记录':`有记录日均热量：${r.averageCalories} kcal`,
    r.averageProtein===null?'蛋白质：暂无记录':`有记录日均蛋白质：${r.averageProtein} g（仅已填写部分）`,
    '漏记日期不计入日均；餐食记录不代表已完整覆盖全天。','']:[]),
    ...(includeWeight?['03 / 体重趋势',r.weightDelta===null?`体重：本周 ${r.weightDays} 天有记录，不足以计算周内变化`:`体重记录：${r.firstWeight.d} ${r.firstWeight.w}${r.unit} → ${r.lastWeight.d} ${r.lastWeight.w}${r.unit}（周内 ${r.weightDelta>=0?'+':''}${r.weightDelta}${r.unit}）`,'']:[]),
    '每日回顾',...r.days.map(d=>`${d.date} ${d.label} | 工作组 ${d.sets}${includeFood?' | 热量 '+(d.calories??'未记'):''}${includeWeight?' | 体重 '+(d.weight??'未记'):''}`),
    '', '本周报根据个人记录生成。训练容量不是运动消耗热量。',
  ].join('\n')
}
