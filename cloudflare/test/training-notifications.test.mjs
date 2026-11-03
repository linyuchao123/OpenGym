import {test} from 'node:test';import assert from 'node:assert/strict';
import {nextPlanReminder,localDay} from '../../api/shared/training-reminders.js';
import {duePush,messagePush,pushRoute} from '../src/push-service.js';
const env={WEB_PUSH_PUBLIC_KEY:'fixture',WEB_PUSH_PRIVATE_KEY:'fixture'},now=Date.parse('2026-11-03T10:00:00Z');
function fixture(){
 const store=new Map();
 const repo={
  read:async(scope,id)=>store.get(scope+':'+id)||null,
  loadRecord:async(scope,id)=>({scope,id,rows:new Map(store.has(scope+':'+id)?[[id,JSON.stringify(store.get(scope+':'+id))]]:[])}),
  save:async(snapshot,rows)=>{
   const key=snapshot.scope+':'+snapshot.id;
   if((snapshot.rows?.get(snapshot.id)||null)!==(store.has(key)?JSON.stringify(store.get(key)):null))throw Object.assign(Error('conflict'),{status:409});
   if(rows.size)store.set(key,JSON.parse([...rows.values()][0]));else store.delete(key);
  },
  db:{prepare(sql){return {bind(...args){return {all:async()=>{
   const results=[...store].filter(([k,p])=>sql.includes("scope='push-outbox'")?k.startsWith('push-outbox:')&&p.nextAt<=args[0]:k.startsWith('push-prefs:')&&((p.reminderAt>0&&p.reminderAt<=args[0])||(p.planReminder?.enabled&&p.planNextAt>0&&p.planNextAt<=args[0]))).slice(0,2).map(([k,p])=>({id:k.slice(k.indexOf(':')+1),body:JSON.stringify(p)}));
   return {results};
  }}}}}}
 };
 return {repo,store};
}
const prefs=()=>({uid:'a',messages:true,tz:'Asia/Shanghai',reminderAt:null,planReminder:{enabled:true,time:'18:00'},planNextAt:now});
const state=()=>({routines:[{id:'legs',name:'腿与核心'}],week:{2:'legs'},workouts:[]});
test('daily time follows timezone, rolls to tomorrow, and handles DST gaps',()=>{assert.equal(nextPlanReminder('18:30','Asia/Shanghai',now),Date.parse('2026-11-03T10:30:00Z'));assert.equal(nextPlanReminder('18:00','Asia/Shanghai',now),now+86400000);const dst=nextPlanReminder('02:30','America/New_York',Date.parse('2026-03-08T05:00Z'));assert.equal(localDay(dst,'America/New_York'),'2026-03-08');assert(dst>Date.parse('2026-03-08T06:59Z'))});
test('daily reminders use the latest routine and fire once, independent of the page being open',async()=>{const {repo,store}=fixture(),sent=[];store.set('push-prefs:a',prefs());store.set('state:a',state());const send=async(r,e,uid,payload)=>{sent.push({uid,...payload});return {sent:1}};await duePush(repo,env,now,send);await duePush(repo,env,now+1000,send);assert.equal(sent.length,1);assert.match(sent[0].body,/腿与核心/);assert.equal(sent[0].url,'/#/home');assert.equal(store.get('push-prefs:a').planNextAt,now+86400000)});
test('rest overrides and completed workouts skip the daily alert',async()=>{for(const extra of [{dayPlan:{'2026-11-03':'rest'}},{workouts:[{d:'2026-11-03',routineId:'legs'}]}]){const {repo,store}=fixture();store.set('push-prefs:a',prefs());store.set('state:a',{...state(),...extra});let calls=0;await duePush(repo,env,now,async()=>{calls++;return {sent:1}});assert.equal(calls,0);assert.equal(store.get('push-prefs:a').planNextAt,now+86400000)}});
test('failed training push retries and concurrent cron claims do not double-send',async()=>{const {repo,store}=fixture();store.set('push-prefs:a',prefs());store.set('state:a',state());await duePush(repo,env,now,async()=>({sent:0}));assert.equal(store.get('push-prefs:a').planNextAt,now);let calls=0;const send=async()=>{calls++;await Promise.resolve();return {sent:1}};await Promise.all([duePush(repo,env,now+60001,send),duePush(repo,env,now+60001,send)]);assert.equal(calls,1);assert(store.get('push-prefs:a').planNextAt>now+60001)});
test('private push failures queue metadata only, retry, and respect opt-out',async()=>{const {repo,store}=fixture();store.set('push-prefs:a',{messages:true});await messagePush(repo,env,{id:'m',to:'a',text:'private text'},async()=>({sent:0}));const queued=store.get('push-outbox:m');assert(queued);assert(!JSON.stringify(queued).includes('private text'));let sent=0;await duePush(repo,env,queued.nextAt+1,async()=>{sent++;return {sent:1}});assert.equal(sent,1);assert.equal(store.has('push-outbox:m'),false);store.set('push-outbox:m',{...queued,nextAt:now,expiresAt:now+10000});store.set('push-prefs:a',{messages:false});await duePush(repo,env,now,async()=>{throw Error('must not send')});assert.equal(store.has('push-outbox:m'),false)});
test('plan reminders are opt-in and remain configured when the private-message choice changes',async()=>{const {repo,store}=fixture(),u={id:'a'},url=new URL('https://example.com/api/push/preferences');const response=await pushRoute(repo,env,u,'PUT /api/push/preferences',{messages:true,tz:'Asia/Shanghai',planReminder:{enabled:true,time:'19:20'}},url);assert(response.preferences.planNextAt>Date.now());await pushRoute(repo,env,u,'PUT /api/push/preferences',{messages:false,tz:'Asia/Shanghai'},url);assert.equal(store.get('push-prefs:a').planReminder.enabled,true);await assert.rejects(pushRoute(repo,env,u,'PUT /api/push/preferences',{planReminder:{enabled:true,time:'99:00'}},url),/提醒时间/)});
import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {Repository} from '../src/repository.js';
test('actual D1-compatible SQL selects due members and persists leases and next dates atomically',async()=>{
 const sql=new DatabaseSync(':memory:');for(const file of ['0001_initial.sql','0003_record_conflicts.sql'])sql.exec(fs.readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const wrap=(query,args=[])=>({bind(...values){return wrap(query,values)},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return sql.prepare(query).run(...args)}});
 const db={prepare:wrap,async batch(statements){sql.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.all());sql.exec('COMMIT');return rows}catch(e){sql.exec('ROLLBACK');throw e}}},repo=new Repository(db),put=async(scope,id,value)=>repo.save(await repo.loadRecord(scope,id),new Map([[id,JSON.stringify(value)]]));
 try{for(const id of ['a','b','future']){await put('push-prefs',id,{...prefs(),uid:id,planNextAt:id==='future'?now+86400000:now});await put('state',id,state())}const recipients=[];await duePush(repo,env,now,async(r,e,id)=>{recipients.push(id);return {sent:1}});assert.deepEqual(recipients.sort(),['a','b']);assert.equal((await repo.read('push-prefs','a')).planNextAt,now+86400000);assert.equal((await repo.read('push-prefs','a')).leaseToken,undefined);assert.equal(sql.prepare('SELECT COUNT(*) n FROM document_checks').get().n,0)}finally{sql.close()}
});
