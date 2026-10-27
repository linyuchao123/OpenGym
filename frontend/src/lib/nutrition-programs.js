import catalogue from './food-catalogue.json'
import {foodPortion,macroTargets} from './nutrition-targets.js'
export const DIRECTIONS=[{id:'loss',name:'减脂计划',short:'减脂食品',icon:'flame',image:'05062'},{id:'gain',name:'增肌计划',short:'增肌食品',icon:'dumbbell',image:'20045'},{id:'shape',name:'塑形计划',short:'塑形食品',icon:'activity',image:'15236'},{id:'health',name:'健康计划',short:'通用健康食品',icon:'heart',image:'11090'}]
export const PROGRAMS={
 loss:[{id:'canteen',name:'食堂日常',desc:'主食、瘦肉和蔬菜，三餐更好安排',icon:'utensils',mode:'fixed',energy:2000},{id:'prep',name:'居家备餐',desc:'提前分装，工作学习日也能按计划吃',icon:'calendar',mode:'fixed',energy:1800},{id:'training',name:'训练与休息分日',desc:'训练日多留一些碳水，休息日灵活调整',icon:'dumbbell',mode:'training-rest',energy:2200,rest:2000}],
 gain:[{id:'steady',name:'规律三餐＋加餐',desc:'把摄入分到全天，不必一顿吃撑',icon:'utensils',mode:'fixed',energy:2400},{id:'fuel',name:'训练供能',desc:'在训练日安排更充足的主食与蛋白',icon:'dumbbell',mode:'training-rest',energy:2600,rest:2400},{id:'easy',name:'省时增肌',desc:'奶、蛋、谷物和便捷加餐，减少备餐时间',icon:'clock',mode:'fixed',energy:2200}],
 shape:[{id:'balance',name:'力量训练＋均衡饮食',desc:'兼顾三餐、训练表现和长期习惯',icon:'dumbbell',mode:'fixed',energy:2200},{id:'cycle',name:'训练日灵活配餐',desc:'围绕一周安排调整每天的餐食',icon:'calendar',mode:'training-rest',energy:2200,rest:2000},{id:'routine',name:'稳定记录',desc:'先保持规律，再结合体重与训练记录调整',icon:'chart',mode:'fixed',energy:2000}],
 health:[{id:'variety',name:'多样化三餐',desc:'谷物、蔬果、蛋白来源轮换着吃',icon:'utensils',mode:'fixed',energy:2000},{id:'plants',name:'植物食物搭配',desc:'豆类、谷物与蔬果，让餐盘更加丰富',icon:'heart',mode:'fixed',energy:2000},{id:'schedule',name:'一周自由安排',desc:'按自己的作息设置每天的目标',icon:'calendar',mode:'weekly',energy:2200}]
}
export function programDraft(program,goal,date){const targets=program.mode==='training-rest'?{training:macroTargets(program.energy,goal),rest:macroTargets(program.rest,goal)}:program.mode==='weekly'?Object.fromEntries(['0','1','2','3','4','5','6'].map(k=>[k,macroTargets(program.energy,goal)])):{daily:macroTargets(program.energy,goal)};return {mode:program.mode,start:date,targets,direction:goal,program:program.id,title:program.name}}
const combinations=[
 {name:'家常轻烹',meals:[[['08120',50],['01116',200],['09040',120]],[['20045',200],['05062',180],['11090',200],['04053',8]],[['11507',220],['15236',150],['11457',200]],[['01077',250],['09003',150],['12061',15]]]},
 {name:'食堂易搭',meals:[[['18075',80],['01123',100],['01077',250]],[['20045',220],['10060',180],['11529',200],['04053',8]],[['20037',220],['05062',160],['11205',200],['04053',8]],[['01116',200],['09040',120]]]},
 {name:'豆类与鱼',meals:[[['08120',50],['16120',250],['09316',150]],[['20137',200],['16126',250],['11090',200],['04053',8]],[['20045',200],['15236',160],['11457',200]],[['01116',200],['09050',100],['12155',15]]]}
]
export const FOOD_BY_ID=Object.fromEntries(catalogue.map(f=>[f.sourceId,f]))
export function recipeDay(energy=2000,index=0){const recipe=combinations[index%combinations.length],base=recipe.meals.map(row=>row.map(([id,g])=>({food:FOOD_BY_ID[id],grams:g}))),total=base.flat().reduce((n,x)=>n+foodPortion(x.food,x.grams).calories,0),factor=energy/total;const meals=base.map(row=>row.map(x=>({food:x.food,...foodPortion(x.food,Math.max(1,Math.round(x.grams*factor)))})));const nutrients=meals.flat().reduce((n,x)=>{for(const k of ['calories','protein','carbs','fat'])n[k]+=x[k]||0;return n},{calories:0,protein:0,carbs:0,fat:0});return {name:recipe.name,meals,nutrients}}
// Browsing collections express food selection priorities, never label foods as fat-burning.
export function directionFoods(goal){return catalogue.filter(f=>goal==='loss'?!(['01009','19296','16098'].includes(f.sourceId)):goal==='gain'?!['19296'].includes(f.sourceId):goal==='shape'?!['19296'].includes(f.sourceId):true)}
