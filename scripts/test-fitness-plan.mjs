// Explicit live provider check with synthetic adult numbers; never sends user photos or identity.
import {generateFitnessPlan} from '../api/fitness-planner.js';
const intake={adult:true,place:'home',experience:'beginner',days:[1,3,5],equipment:['dumbbell'],minutes:40,goal:'recomp',focus:'肩部和背部，均衡训练',usualParts:'偶尔训练',limitations:''};
if(!process.env.FOOD_AI_API_KEY)throw Error('缺少本机服务配置');
const start=Date.now();try{const r=await generateFitnessPlan({body:{consent:true,intake},profile:{heightCm:175,weightKg:75,bodyContext:'adult'},state:{},config:process.env});console.log(JSON.stringify({ok:true,seconds:Math.round((Date.now()-start)/1000),model:r.model,direction:r.plan.direction,days:r.plan.sessions.map(s=>s.day),exercises:r.plan.sessions.map(s=>s.exercises.length)}));}catch(e){console.log(JSON.stringify({ok:false,status:e.status,error:e.message}));process.exitCode=1}
