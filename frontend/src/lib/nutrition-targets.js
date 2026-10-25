export function targetForDate(config,date,training=false,fallback=0,history=[]){
 const eligible=[...history,...(config?[config]:[])].filter(c=>c.start<=date).sort((a,b)=>b.start.localeCompare(a.start)||(b.version||0)-(a.version||0));
 const c=eligible[0];if(!c)return {calories:fallback||0,protein:null,carbs:null,fat:null,label:'自定每日目标'};
 const key=c.mode==='fixed'?'daily':c.mode==='training-rest'?(training?'training':'rest'):String(new Date(date+'T12:00:00').getDay());
 return {...c.targets?.[key],label:c.mode==='fixed'?'固定每日目标':c.mode==='training-rest'?(training?'训练日目标':'休息日目标'):'按周目标'};
}
export function foodPortion(food,grams){const factor=Number(grams)/100;if(!Number.isFinite(factor)||factor<=0||factor>200)return null;return {name:food.name,grams:Number(grams),gramsSource:'manual',...Object.fromEntries(['calories','protein','carbs','fat'].map(k=>[k,food[k]==null?null:Math.round(food[k]*factor*10)/10]))}}
