import {it,expect} from 'vitest'
import {homeHighlights} from './home-highlights.js'
const day='2026-10-18'
it('keeps future and invalid workouts out of accumulated milestones and picks the latest record by date',()=>{
 const S={workouts:[{d:'2026-10-17',prs:['older']},{d:'2026-10-18',prs:['newer']},{d:'2026-10-16',prs:['backfill']},{d:'2026-10-19',prs:['future']},{d:'invalid'}]}
 const h=homeHighlights(S,[],day);expect(h.totalWorkouts).toBe(3);expect(h.trainingDays).toBe(3);expect(h.todayWorkouts).toBe(1);expect(h.latestRecord.exercise).toBe('newer');expect([h.achieved,h.next]).toEqual([1,5])
})
it('distinguishes missing food from recorded zero and only shows a weight actually recorded today',()=>{
 const S={bodyweight:[{d:'2026-10-17',w:70},{d:day,w:69,t:1},{d:day,w:68.9,t:2},{d:day,w:-1,t:3}]}
 expect(homeHighlights({},[],day).todayMeals).toBe(0)
 const h=homeHighlights(S,[{date:day,items:[{calories:0}]}],day);expect(h.todayMeals).toBe(1);expect(h.calories).toBe(0);expect(h.todayWeight.w).toBe(68.9)
 expect(homeHighlights(S,[],'2026-10-16').todayWeight).toBeUndefined()
})
it('uses earned thresholds and does not mutate imported order',()=>{
 const S={workouts:Array.from({length:10},(_,i)=>({d:`2026-10-${String(i+1).padStart(2,'0')}`}))};const before=structuredClone(S)
 const h=homeHighlights(S,[],day);expect([h.achieved,h.next]).toEqual([10,25]);expect(S).toEqual(before)
})
