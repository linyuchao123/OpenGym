import {describe,it,expect} from 'vitest'
import {DIRECTIONS,PROGRAMS,programDraft,recipeDay} from './nutrition-programs.js'
import {foodPortion,targetForDate,withMacroTargets} from './nutrition-targets.js'
describe('editable nutrition programs and sourced recipe portions',()=>{
 it('offers four directions and valid fixed, split and weekly targets',()=>{expect(DIRECTIONS).toHaveLength(4);for(const d of DIRECTIONS)for(const p of PROGRAMS[d.id]){const draft=programDraft(p,d.id,'2026-10-27');expect(draft.direction).toBe(d.id);for(const row of Object.values(draft.targets)){expect(row.calories).toBeGreaterThan(0);expect(row.protein).toBeGreaterThan(0)}}});
 it('every meal uses catalogue portions and totals match all ingredients at each energy level',()=>{for(let i=0;i<3;i++)for(const energy of [1800,2000,2200,2400,2600]){const day=recipeDay(energy,i);expect(day.meals).toHaveLength(4);expect(Math.abs(day.nutrients.calories-energy)).toBeLessThan(15);for(const item of day.meals.flat()){expect(item.calories).toBe(foodPortion(item.food,item.grams).calories);expect(item.food.sourceId).toBeTruthy()}for(const k of ['calories','protein','carbs','fat'])expect(day.nutrients[k]).toBeCloseTo(day.meals.flat().reduce((n,f)=>n+f[k],0))}})
})

it('uses the effective program direction for missing macros, preserving older program directions',()=>{const old={mode:'fixed',start:'2026-10-01',direction:'loss',targets:{daily:{calories:2000,protein:null,carbs:null,fat:null}}},next={...old,start:'2026-10-27',direction:'health'};expect(withMacroTargets(targetForDate(next,'2026-10-26',false,0,[old]),'gain').protein).toBe(150);expect(withMacroTargets(targetForDate(next,'2026-10-27',false,0,[old]),'gain').protein).toBe(125)})
