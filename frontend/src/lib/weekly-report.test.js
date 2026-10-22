import { describe, it, expect } from 'vitest'
import { weeklyReport, shiftReportWeek, reportText } from './weekly-report.js'
const meal=(date,calories)=>({date,items:[{calories,protein:20}]})
const workout=(d,extra={})=>({d,entries:[],...extra})
describe('weekly report from actual records',()=>{
  it('uses Monday boundaries across years and compares the preceding week',()=>{
    const r=weeklyReport({workouts:[workout('2025-12-28'),workout('2025-12-29'),workout('2026-01-04'),workout('2026-01-05'),workout('invalid')],bodyweight:[]},[],'2026-01-01')
    expect([r.start,r.last,r.workouts,r.previous.workouts,r.workoutDelta]).toEqual(['2025-12-29','2026-01-04',2,1,1])
    expect(shiftReportWeek(r.start,1)).toBe('2026-01-05')
    expect(r.days).toHaveLength(7)
  })
  it('does not turn missing meals into zero-intake days',()=>{
    const rows=[meal('2026-10-12',200),meal('2026-10-12',400),meal('2026-10-14',200),meal('2026-10-05',300)]
    const r=weeklyReport({},rows,'2026-10-18')
    expect([r.foodDays,r.meals,r.averageCalories,r.calorieDelta]).toEqual([2,3,400,100])
    expect(r.days[1].calories).toBeNull()
    expect(weeklyReport({},[],'2026-10-18').averageCalories).toBeNull()
    expect(reportText(r)).toContain('覆盖 2/7 天')
  })
  it('recomputes completed work volume and reports missing duration separately',()=>{
    const w=workout('2026-10-12',{start:100000,end:1900000,vol:99999,entries:[{id:'test-lift',sets:[{w:20,r:10,done:true},{w:50,r:10,done:false},{w:10,r:10,done:true,phase:'warmup'}]}]})
    const r=weeklyReport({workouts:[w,workout('2026-10-13')]},[],'2026-10-18')
    expect(r.minutes).toBe(30);expect(r.missingDuration).toBe(1)
    expect(r.volume).toBe(200);expect(r.sets).toBe(1)
    expect(reportText(r)).toContain('1 次训练缺少时长')
  })
  it('compares distinct weight dates using the last reading each day without mutating records',()=>{
    const S={unit:'lb',bodyweight:[{d:'2026-10-15',w:150,t:2},{d:'2026-10-12',w:155,t:1},{d:'2026-10-15',w:151,t:1},{d:'2026-10-19',w:140,t:4}]}
    const before=structuredClone(S);const r=weeklyReport(S,[],'2026-10-18')
    expect([r.weightDays,r.weightDelta,r.unit]).toEqual([2,-5,'lb']);expect(S).toEqual(before)
    expect(weeklyReport({bodyweight:S.bodyweight.slice(0,1)},[],'2026-10-18').weightDelta).toBeNull()
  })
})
