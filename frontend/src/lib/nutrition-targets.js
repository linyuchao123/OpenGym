export function targetForDate(config,date,training=false,fallback=0,history=[]){
 const eligible=[...history,...(config?[config]:[])].filter(c=>c.start<=date).sort((a,b)=>b.start.localeCompare(a.start)||(b.version||0)-(a.version||0));
 const c=eligible[0];if(!c)return {calories:fallback||0,protein:null,carbs:null,fat:null,label:'自定每日目标'};
 const key=c.mode==='fixed'?'daily':c.mode==='training-rest'?(training?'training':'rest'):String(new Date(date+'T12:00:00').getDay());
 return {...c.targets?.[key],...(c.title?{planTitle:c.title}:{}),...(c.direction?{planDirection:c.direction}:{}),label:c.mode==='fixed'?'固定每日目标':c.mode==='training-rest'?(training?'训练日目标':'休息日目标'):'按周目标'};
}
export function foodPortion(food,grams){const factor=Number(grams)/100;if(!Number.isFinite(factor)||factor<=0||factor>200)return null;return {name:food.name,grams:Number(grams),gramsSource:'manual',...Object.fromEntries(['calories','protein','carbs','fat'].map(k=>[k,food[k]==null?null:Math.round(food[k]*factor*10)/10]))}}
// Editable planning presets, within adult AMDR ranges. Never infer energy needs from weight alone.
export function macroTargets(energy,goal='maintain'){
 const calories=Number(energy)||0;if(calories<=0)return {calories:0,protein:null,carbs:null,fat:null};
 const [p,c,f]=goal==='loss'?[.30,.45,.25]:goal==='gain'?[.25,.50,.25]:[.25,.45,.30];
 return {calories,protein:Math.round(calories*p/4),carbs:Math.round(calories*c/4),fat:Math.round(calories*f/9)};
}
export function withMacroTargets(target,goal){const derived=macroTargets(target.calories,target.planDirection||goal);return {...target,...Object.fromEntries(['protein','carbs','fat'].map(k=>[k,target[k]??derived[k]]))}}
