import { workoutDay } from './history.js'
import { totals } from './nutrition.js'

export function homeHighlights(S, meals, today) {
  const workouts=(S.workouts || []).filter(w=>{const d=workoutDay(w);return d&&d<=today})
  const dayWorkouts=workouts.filter(w=>workoutDay(w)===today)
  const dayMeals=(meals || []).filter(m=>m.date===today)
  const todayWeight=(S.bodyweight || []).filter(x=>x.d===today&&Number.isFinite(Number(x.w))&&Number(x.w)>0).sort((a,b)=>(Number(a.t)||0)-(Number(b.t)||0)).at(-1)
  const latestRecord=workouts.filter(w=>Array.isArray(w.prs)&&w.prs.length).sort((a,b)=>workoutDay(b).localeCompare(workoutDay(a))||(Number(b.start)||0)-(Number(a.start)||0))[0]
  const thresholds=[1,5,10,25,50,100,200,500,1000]
  const achieved=thresholds.filter(n=>workouts.length>=n).at(-1)||0
  const next=thresholds.find(n=>n>workouts.length)||null
  return { todayWorkouts:dayWorkouts.length,todayMeals:dayMeals.length,calories:totals(dayMeals).calories,todayWeight,
    totalWorkouts:workouts.length,trainingDays:new Set(workouts.map(workoutDay)).size,achieved,next,
    latestRecord:latestRecord?{workout:latestRecord,exercise:latestRecord.prs[0],date:workoutDay(latestRecord)}:null }
}
