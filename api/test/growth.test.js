import {test} from 'node:test';
import assert from 'node:assert/strict';
import {growthSummary,publicGrowth,growthHTML,effectiveWorkout} from '../shared/growth.js';
import {usageMetrics} from '../shared/usage-metrics.js';
const w=(id,d,extra={})=>({id,d,end:Date.parse(d+'T12:00:00Z'),entries:[{id:'x',sets:[{done:true,w:20,r:8}]}],...extra});
test('growth counts completed work, unique training dates and reflects edits/deletions',()=>{
 const state={workouts:[w('1','2026-10-01'),w('2','2026-10-01'),w('3','2026-10-24'),w('4','2026-10-24',{entries:[{sets:[{done:true,r:8,warmup:true}]}]}),w('5','invalid')]};
 const g=growthSummary(state,'2026-10-24');assert.equal(g.total,3);assert.equal(g.trainingDays,2);assert.equal(g.recentDays,2);assert.equal(g.weeks.length,4);assert.equal(g.milestone,1);
 state.workouts=[];assert.equal(growthSummary(state).milestone,null);assert.equal(effectiveWorkout(w('x','2026-10-24',{entries:[{sets:[{done:true,r:0}]}]})),false);
});
test('public growth is a field allowlist and escapes user strings in noindex HTML',()=>{
 const p={nickname:'<img src=x onerror=alert(1)>',bio:'secret',weightKg:75,externalShare:{fields:['nickname']}};
 const out=publicGrowth(p,{workouts:[w('1','2026-10-24')]});assert.deepEqual(Object.keys(out),['nickname']);assert.equal(out.growth,undefined);
 const html=growthHTML(out);assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('noindex'));assert.ok(!html.includes('secret'));
});
test('effective retention distinguishes visits, immature cohorts and different recording dates',()=>{
 const now=Date.parse('2026-10-24T12:00Z'),users=[{id:'a',created:'2026-10-01T00:00Z'},{id:'b',created:'2026-10-24T11:00Z'},{id:'c',created:'2026-10-01T00:00Z'}];
 const m=usageMetrics(users,{a:{workouts:[w('first','2026-10-01'),w('d7','2026-10-08'),w('recent1','2026-10-23'),w('recent2','2026-10-24')]}},{},now);
 assert.equal(m.weeklyEffective,1);assert.equal(m.consistentWeekly,1);assert.equal(m.activation24h.eligible,2);assert.equal(m.activation24h.count,1);assert.equal(m.d7Effective.count,1);assert.equal(m.d7Effective.eligible,2);
});
