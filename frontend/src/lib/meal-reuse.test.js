import {it,expect} from 'vitest'
import {reuseMeal,previousMealDate} from './meal-reuse.js'
const old={id:'private-id',date:'2026-10-17',type:'lunch',photo:'old-photo',source:'ai-reviewed',mealStyle:'balanced',styleReason:'搭配参考',items:[{name:'米饭',grams:100,calories:120,protein:null,carbs:26,fat:0,advice:'细嚼慢咽'}]}
it('makes a new draft for the requested date without the old ID or photo and keeps unknown nutrition unknown',()=>{
 const before=structuredClone(old);const copy=reuseMeal(old,'2026-10-18',1.5)
 expect(copy.id).toBeUndefined();expect(copy.date).toBe('2026-10-18');expect(copy.photo).toBe('');expect(copy.items[0]).toMatchObject({grams:150,calories:180,protein:null,carbs:39,fat:0});expect(copy.source).toBe('ai-reviewed');expect(copy.mealStyle).toBe('unknown');expect(copy.items[0].advice).toBe('');expect(old).toEqual(before)
})
it('scales from the source rather than a previously scaled draft, and rejects invalid portions',()=>{
 expect(reuseMeal(old,'2026-10-18',2).items[0].calories).toBe(240);expect(reuseMeal(old,'2026-10-18',.5).items[0].calories).toBe(60)
 for(const factor of [0,NaN,Infinity,11])expect(()=>reuseMeal(old,'2026-10-18',factor)).toThrow()
 expect(reuseMeal(old,'2026-10-18').styleReason).toBe('搭配参考')
})
it('finds the previous local date at month/year/leap boundaries',()=>{
 expect(previousMealDate('2026-01-01')).toBe('2025-12-31');expect(previousMealDate('2024-03-01')).toBe('2024-02-29')
})
