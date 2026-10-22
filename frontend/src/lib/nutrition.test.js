import { describe, expect, it } from 'vitest'
import { nutritionPeriod, nutritionStats, totals } from './nutrition.js'
const meal=(date,calories,type='lunch')=>({date,type,items:[{name:'测试食物',calories,protein:10,carbs:null,fat:2}]})
describe('nutrition calendar aggregation',()=>{
  it('uses Monday weeks, actual month ends and leap years',()=>{
    expect(nutritionPeriod('2026-10-18','week')).toEqual({start:'2026-10-12',end:'2026-10-19'})
    expect(nutritionPeriod('2024-02-29','month')).toEqual({start:'2024-02-01',end:'2024-03-01'})
    expect(nutritionStats([],'2024-02-29','month').buckets).toHaveLength(29)
    expect(nutritionPeriod('2026-12-31','year')).toEqual({start:'2026-01-01',end:'2027-01-01'})
  })
  it('keeps adjacent dates out and averages only recorded days',()=>{
    const rows=[meal('2026-10-11',900),meal('2026-10-12',200),meal('2026-10-12',400,'dinner'),meal('2026-10-14',200),meal('2026-10-19',800)]
    const s=nutritionStats(rows,'2026-10-17','week')
    expect(s.total.calories).toBe(800);expect(s.days).toBe(2);expect(s.average).toBe(400);expect(s.buckets).toHaveLength(7)
    expect(s.buckets[0].calories).toBe(600)
  })
  it('groups a day by meals and a year by 12 months without inventing records',()=>{
    const rows=[meal('2026-01-01',300,'breakfast'),meal('2026-02-01',500),meal('2027-01-01',1000)]
    expect(nutritionStats(rows,'2026-01-01','day').buckets[0].calories).toBe(300)
    const s=nutritionStats(rows,'2026-12-31','year');expect(s.buckets).toHaveLength(12);expect(s.total.calories).toBe(800);expect(s.buckets[1].calories).toBe(500)
    expect(totals([]).calories).toBe(0);expect(nutritionStats([],'2026-10-17','day').average).toBe(0)
  })
})
