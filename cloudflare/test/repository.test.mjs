import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {Repository,encodeLife,decodeLife} from '../src/repository.js';
function db(){const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));sql.exec(fs.readFileSync(new URL('../migrations/0003_record_conflicts.sql',import.meta.url),'utf8'));const wrap=(query,args=[])=>({bind(...values){return wrap(query,values)},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return sql.prepare(query).run(...args)}});return {sql,prepare:wrap,async batch(statements){sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.all());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}}}
test('D1 revision transaction rejects stale writes atomically',async()=>{const d=db(),r=new Repository(d),a=await r.load('test'),b=await r.load('test');await r.save(a,new Map([['a','{"value":1}']]));await assert.rejects(()=>r.save(b,new Map([['b','{}']])),e=>e.status===409);assert.deepEqual(await r.read('test','a'),{value:1});assert.equal(await r.read('test','b'),null);assert.equal(d.sql.prepare('SELECT COUNT(*) AS n FROM revision_checks').get().n,0);d.sql.close()});
test('media quotas are atomic, owner scoped and cannot be disabled by environment',async()=>{const d=db(),r=new Repository(d);d.sql.prepare('INSERT INTO blobs VALUES(?,?,?,?,?)').run('old','alice','image/jpeg',20*1024*1024,0);await assert.rejects(()=>r.putBlob('new','alice','image/jpeg',new Uint8Array([1,2,3])),e=>e.status===413);assert.equal(await r.blobMeta('new'),null);await r.putBlob('bob','bob','image/jpeg',new Uint8Array([1,2,3]));assert.equal((await r.usage('bob')).bytes,3);for(let i=0;i<4;i++)d.sql.prepare('INSERT INTO blobs VALUES(?,?,?,?,?)').run('padding'+i,'other'+i,'image/jpeg',(i===3?19:20)*1024*1024,0);await assert.rejects(()=>r.putBlob('big','dave','image/jpeg',new Uint8Array(2*1024*1024)),e=>e.status===413);assert.equal(await r.blobMeta('big'),null);assert.equal(d.sql.prepare('SELECT COUNT(*) AS n FROM blob_parts WHERE id=?').get('big').n,0);d.sql.close()});
test('private binary content round trips through multiple D1 chunks',async()=>{const d=db(),r=new Repository(d),b=new Uint8Array(400000);b[131073]=99;await r.putBlob('a','alice','image/jpeg',b);assert.deepEqual(await r.getBlob('a'),b);await r.deleteBlob('a');await assert.rejects(()=>r.getBlob('a'),e=>e.status===404);d.sql.close()});
test('normalized lifestyle rows preserve chronology and split users',()=>{const data={people:{alice:{profile:{nickname:'甲'},meals:[]},bob:{profile:{nickname:'乙'},meals:[]}},posts:[{id:'z',createdAt:1},{id:'a',createdAt:2}]};const rows=encodeLife(data);assert.ok(rows.has('people:alice'));const restored=decodeLife(new Map([...rows].reverse()));assert.deepEqual(restored.posts.map(x=>x.id),['z','a']);assert.equal(restored.people.bob.profile.nickname,'乙')});
test('byte ranges fetch only the required blob chunks and preserve cross-chunk boundaries',async()=>{const d=db(),r=new Repository(d),b=new Uint8Array(400000).map((_,i)=>i%251);await r.putBlob('range','alice','video/mp4',b);let queries=[];const original=d.prepare;d.prepare=(query)=>{queries.push(query);return original(query)};assert.deepEqual(await r.getBlobRange('range',131070,131080),b.slice(131070,131081));assert.ok(queries.some(q=>q.includes('part BETWEEN')));d.sql.close()});
test('unread counts exclude duplicate message notifications, blocked peers and deleted posts',async()=>{const {unreadSummary}=await import('../src/repository.js');const d=db(),r=new Repository(d);const put=(id,x)=>d.sql.prepare('INSERT OR REPLACE INTO documents(scope,id,body) VALUES(?,?,?)').run('life',id,JSON.stringify(x));put('people:a',{notificationPrefs:{muted:false}});put('posts:p',{id:'p',uid:'b'});put('messages:m',{to:'a',from:'b',readAt:null});put('messages:other',{to:'c',from:'b',readAt:null});put('notifications:n',{to:'a',from:'b',readAt:null,kind:'message'});put('notifications:like',{to:'a',from:'b',readAt:null,kind:'like',post:'p'});put('notifications:deleted',{to:'a',from:'b',readAt:null,kind:'like',post:'missing'});assert.deepEqual(await unreadSummary(r,'a'),{total:2,messages:1,interactions:1});put('blocks:b',['a']);assert.equal((await unreadSummary(r,'a')).total,0);put('blocks:b',[]);put('people:a',{notificationPrefs:{muted:true}});assert.equal((await unreadSummary(r,'a')).total,0);d.sql.close()});

test('different users save independently while same record and deletion conflicts remain atomic',async()=>{
 const d=db(),r=new Repository(d),a=await r.loadRecord('state','alice'),b=await r.loadRecord('state','bob');
 await r.save(a,new Map([['alice','{"n":1}']]));await r.save(b,new Map([['bob','{"n":2}']]));
 const old=await r.loadRecord('state','alice');await r.save(a,new Map([['alice','{"n":3}']]));
 await assert.rejects(()=>r.save(old,new Map()),e=>e.status===409);assert.deepEqual(await r.read('state','alice'),{n:3});
 const x=await r.loadRecord('life','posts:a'),y=await r.loadRecord('life','posts:b');await r.save(x,new Map([['posts:a','{"id":"a"}']]));await r.save(y,new Map([['posts:b','{"id":"b"}']]));
 assert.equal((await r.load('life')).rows.size,2);const z=await r.loadRecord('life','posts:b');await r.save(z,new Map([['posts:b','{"n":3}']]));await assert.rejects(()=>r.save(y,new Map([['posts:b','{"changed":true}']])),e=>e.status===409);
 assert.equal(d.sql.prepare('SELECT COUNT(*) n FROM document_checks').get().n,0);d.sql.close();
});

test('SQL feed page preserves blocks, saved filters, tied-date cursors and originals outside page',async()=>{
 const {feedSnapshot}=await import('../src/feed-query.js');const d=db(),r=new Repository(d);const put=(id,x)=>d.sql.prepare('INSERT INTO documents(scope,id,body) VALUES(?,?,?)').run('life',id,JSON.stringify(x));
 for(let n=0;n<1000;n++)put('people:u'+n,{profile:{nickname:'member '+n},meals:[{note:'PRIVATE'}]});
 put('posts:a',{id:'a',uid:'u1',text:'training',createdAt:10,media:[],comments:[],likes:[]});put('posts:b',{id:'b',uid:'u2',text:'training',createdAt:10,media:[],comments:[],likes:[]});put('posts:c',{id:'c',uid:'u3',text:'training',createdAt:20,media:[],comments:[],likes:[],repostOf:'a'});put('blocks:u2',['viewer']);
 let page=await feedSnapshot(r,'viewer',new URLSearchParams({limit:'1'}));assert.deepEqual([...page.feedIds],['c','a']);assert.ok(page.snapshot.rows.has('people:u3'));assert.ok(!page.snapshot.rows.has('people:u900'));assert.equal(page.feedTotal,2);assert.equal(page.shareCounts.a,1);
 page=await feedSnapshot(r,'viewer',new URLSearchParams({before:'20:c',limit:'1'}));assert.deepEqual([...page.feedIds],['a']);
 page=await feedSnapshot(r,'viewer',new URLSearchParams({saved:'1'}));assert.equal(page.feedIds.size,0);d.sql.close();
});

test('bulk receipt acknowledges over 90 rows atomically and preserves later and foreign messages',async()=>{
 const {acknowledgeNotifications,unreadSummary}=await import('../src/repository.js'),d=db(),r=new Repository(d),put=(id,body)=>d.sql.prepare('INSERT INTO documents VALUES(?,?,?)').run('life',id,JSON.stringify(body));
 for(let n=0;n<500;n++)put('notifications:n'+n,{id:'n'+n,to:'a',from:'b',kind:'follow',createdAt:n,readAt:null});
 put('messages:old',{id:'old',to:'a',from:'b',createdAt:1,readAt:null});put('messages:new',{id:'new',to:'a',from:'b',createdAt:3,readAt:null});put('notifications:foreign',{id:'foreign',to:'c',from:'b',createdAt:0,readAt:null});
 await acknowledgeNotifications(r,'a',{through:{notification:'n499',message:'old'}});assert.equal((await unreadSummary(r,'a')).total,1);assert.equal((await r.read('life','notifications:foreign')).readAt,null);await assert.rejects(()=>acknowledgeNotifications(r,'a',{through:{notification:'foreign'}}),e=>e.status===400);d.sql.close();
});

test('scoped post writes preserve private profiles and reject a concurrent block',async()=>{
 const {writeSnapshot}=await import('../src/write-query.js'),d=db(),r=new Repository(d),put=(id,x)=>d.sql.prepare('INSERT OR REPLACE INTO documents VALUES(?,?,?)').run('life',id,JSON.stringify(x));
 put('people:a',{profile:{nickname:'owner'},meals:[{note:'private owner'}]});put('people:commenter',{profile:{nickname:'reader'},meals:[{note:'NEVER DROP'}]});put('posts:p',{id:'p',uid:'a',createdAt:1,media:[],likes:[],comments:[{id:'c',uid:'commenter',text:'hello'}]});
 const w=await writeSnapshot(r,'viewer','POST /api/life/react',{id:'p'}),rows=new Map(w.snapshot.rows),post=JSON.parse(rows.get('posts:p'));post.likes=['viewer'];rows.set('posts:p',JSON.stringify(post));
 // A projected, rendering-only profile may normalize differently; it must never erase meals.
 rows.set('people:commenter',JSON.stringify({profile:{nickname:'reader'}}));await r.save(w.snapshot,rows);assert.equal((await r.read('life','people:commenter')).meals[0].note,'NEVER DROP');
 const stale=await writeSnapshot(r,'viewer','POST /api/life/react',{id:'p'});put('blocks:a',['viewer']);const changed=new Map(stale.snapshot.rows);changed.set('posts:p',JSON.stringify({...post,likes:[]}));await assert.rejects(()=>r.save(stale.snapshot,changed),e=>e.status===409);assert.deepEqual((await r.read('life','posts:p')).likes,['viewer']);d.sql.close();
});
