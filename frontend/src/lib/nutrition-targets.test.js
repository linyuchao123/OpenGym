import {describe,it,expect} from 'vitest'
import {macroTargets,withMacroTargets,foodPortion} from './nutrition-targets.js'
import foods from './food-catalogue.json'
describe('goal planning',()=>{
 it('derives editable macros without overwriting explicit targets, including zero',()=>{expect(macroTargets(2000,'loss')).toEqual({calories:2000,protein:150,carbs:225,fat:56});expect(withMacroTargets({calories:2000,protein:0,carbs:null,fat:70},'loss')).toEqual({calories:2000,protein:0,carbs:225,fat:70});expect(macroTargets(0).protein).toBeNull()})
 it('keeps source identity, cooking state, thumbnail slot and scales all sourced foods',()=>{expect(foods).toHaveLength(47);expect(new Set(foods.map(f=>f.sourceId)).size).toBe(47);for(const f of foods){expect(f.sourceDescription.length).toBeGreaterThan(0);expect(f.state).toBeTruthy();expect(f.image).toBeGreaterThanOrEqual(0);expect(f.image).toBeLessThan(48);expect(foodPortion(f,200).calories).toBeCloseTo(f.calories*2,1);expect(foodPortion(f,-1)).toBeNull()}})
})
