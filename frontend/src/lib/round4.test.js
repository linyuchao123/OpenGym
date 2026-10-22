// @vitest-environment happy-dom
import {it,expect} from 'vitest'
import {parsePortion,portionGrams} from './food-portions.js'
import {homeLayout} from './home-layout.js'
import {createLifeBackup,readLifeBackup} from './lifestyle-backup.js'
it('recognizes single Chinese serving phrases while refusing an ambiguous combined meal',()=>{
 expect(parsePortion('一碗米饭')).toMatchObject({name:'米饭',count:1,unit:'碗'});expect(parsePortion('两个鸡蛋').count).toBe(2);expect(parsePortion('一杯牛奶').gramsEach).toBe(250);expect(parsePortion('两个鸡蛋和一杯牛奶')).toBeNull();expect(portionGrams(.5,150)).toBe(75);expect(portionGrams(100,1000)).toBeNull()
})
it('keeps hidden choices and order while repairing unknown and duplicate home cards',()=>{
 const r=homeLayout([{id:'weight',show:false},{id:'weight'},{id:'unknown'}]);expect(r[0]).toEqual({id:'weight',show:false});expect(r).toHaveLength(8);expect(new Set(r.map(x=>x.id)).size).toBe(8)
})
it('verifies a metadata backup before restoration and rejects corruption and invalid records',async()=>{
 const meals=[{id:'m',date:'2026-10-18',type:'lunch',items:[{name:'米饭',calories:200,grams:150}]}];const backup=await createLifeBackup(meals,[]);expect((await readLifeBackup(JSON.stringify(backup))).meals).toEqual(meals)
 backup.data.meals[0].items[0].calories=999;await expect(readLifeBackup(JSON.stringify(backup))).rejects.toThrow('校验');await expect(createLifeBackup([{...meals[0],date:'2026-02-30'}],[])).rejects.toThrow('日期')
})
