import {test} from 'node:test';import assert from 'node:assert/strict';
import {generateFitnessPlan} from '../fitness-planner.js';
const intake={adult:true,place:'home',experience:'beginner',days:[1,3],equipment:[],minutes:30,goal:'unsure'};
const plan={direction:'maintain',summary:'循序渐进',guidance:'先熟悉动作',sessions:[1,3].map(day=>({day,name:'全身训练',exercises:[{id:'0662',sets:2,reps:10,restSec:60},{id:'1197',sets:2,reps:10,restSec:60}]}))};
const config={FOOD_AI_API_KEY:'fixture-only'};
test('planner requires consent and keeps identity out of model payload',async()=>{
 let sent;const fetchImpl=async(url,opts)=>{sent=JSON.parse(opts.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(plan)}}]}),{headers:{'content-type':'application/json'}})};
 await assert.rejects(()=>generateFitnessPlan({body:{intake},profile:{},state:{},config,fetchImpl}),e=>e.status===400);assert.equal(sent,undefined);
 const r=await generateFitnessPlan({body:{intake,consent:true,photos:[{kind:'current',data:'data:image/jpeg;base64,/9j/2Q=='}]},profile:{nickname:'NEVER-SEND-NAME',personality:'PRIVATE-MBTI',heightCm:175,weightKg:70},state:{},config,fetchImpl});
 assert.equal(r.plan.sessions.length,2);assert.equal(r.physical.bmi,22.9);assert.ok(!JSON.stringify(sent).includes('NEVER-SEND'));assert.ok(!JSON.stringify(sent).includes('PRIVATE-MBTI'));assert.equal(sent.messages[1].content.at(-1).type,'image_url');assert.equal(sent.response_format.type,'json_object');
});
test('planner rejects unsafe parameters and fabricated catalogue IDs before anything is applied',async()=>{
 for(const mutate of [p=>p.sessions[0].exercises[0].id='FAKE',p=>p.sessions[0].exercises[0].sets=20,p=>p.direction='loss']){const p=structuredClone(plan);mutate(p);await assert.rejects(()=>generateFitnessPlan({body:{intake,consent:true},profile:{heightCm:180,weightKg:50},state:{},config,fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(p)}}]}))}),e=>e.status===502)}
});
test('planner refuses remote image URLs, invalid adult intake and provider failures',async()=>{
 const base={profile:{},state:{},config,fetchImpl:async()=>new Response('no',{status:429})};await assert.rejects(()=>generateFitnessPlan({...base,body:{intake,consent:true,photos:[{kind:'current',data:'https://external.test/private'}]}}),e=>e.status===400);await assert.rejects(()=>generateFitnessPlan({...base,body:{intake:{...intake,adult:false},consent:true}}),e=>e.status===400);await assert.rejects(()=>generateFitnessPlan({...base,body:{intake,consent:true}}),e=>e.status===502)
});
