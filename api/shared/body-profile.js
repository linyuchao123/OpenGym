export function bmiOf(heightCm,weightKg){const h=Number(heightCm),w=Number(weightKg);return h>=100&&h<=250&&w>=25&&w<=350?w/(h/100)**2:null}
export function bmiReading(heightCm,weightKg,context='unspecified'){
 const raw=bmiOf(heightCm,weightKg);if(!raw)return null
 const bmi=Math.round(raw*10)/10
 if(context!=='adult')return {bmi,label:'仅显示计算值',advice:'成人分段不适用于未成年人、孕期等情况。请结合实际情况咨询专业人士。'}
 const item=raw<18.5?['体重偏低','优先规律进餐、循序渐进练习力量；不建议以减重为目标。']:raw<24?['成人参考范围内','可结合训练经验选择增肌、维持或改善身体组成，不必只追求体重下降。']:raw<28?['高于成人参考范围','可结合腰围、训练经验和个人目标，考虑渐进力量训练与适量有氧。']:['明显高于成人参考范围','先选择可承受的低冲击活动和渐进力量训练；有不适或基础疾病时先咨询专业人士。']
 return {bmi,label:item[0],advice:item[1]+' BMI不能区分脂肪和肌肉，不等于体脂或医学诊断。'}
}
export function publicBody(p={}){const visible=p.visibility||{},out={};if(visible.personality&&p.personality)out.personality=p.personality;if(visible.height&&p.heightCm)out.heightCm=p.heightCm;if(visible.weight&&p.weightKg)out.weightKg=p.weightKg;if(visible.bmi&&p.bodyContext==='adult'){const b=bmiOf(p.heightCm,p.weightKg);if(b)out.bmi=Math.round(b*10)/10}return out}
export function latestBody(profile={},state={}){const last=[...(state.bodyweight||[])].sort((a,b)=>(b.t||Date.parse(b.d)||0)-(a.t||Date.parse(a.d)||0))[0];const newer=last&&(last.t||Date.parse(last.d)||0)>(profile.bodyUpdatedAt||0);return {heightCm:profile.heightCm||null,weightKg:newer?Math.round(last.w*(state.unit==='lb'?.45359237:1)*100)/100:profile.weightKg||(last?Math.round(last.w*(state.unit==='lb'?.45359237:1)*100)/100:null),bodyContext:profile.bodyContext||'unspecified'}}
