import {test} from 'node:test';
import assert from 'node:assert/strict';
import {socialRoutes} from '../lifestyle-social.js';

function fixture(){
 const accounts=new Map(['me','a','b','new','disabled'].map(id=>[id,{id,name:'注册昵称-'+id,disabled:id==='disabled'}]));
 const db={people:{me:{profile:{nickname:'我'}},a:{profile:{nickname:'甲'}},b:{profile:{nickname:'乙'}}},follows:{a:['me'],b:['me'],new:['me','me'],disabled:['me'],deleted:['me'],me:['a','a','disabled','deleted','me']},blocks:{},posts:[],notifications:[]};
 const routes=socialRoutes({getDB:()=>db,getMember:id=>{const a=accounts.get(id);return a&&!a.disabled?{id:a.id,name:a.name}:null},commit:async fn=>fn(db),publicPerson:id=>({id,nickname:db.people[id]?.profile?.nickname||accounts.get(id)?.name||'健身伙伴'}),wrap:fn=>async(req,res)=>fn(req,res,{id:'me',name:'我'}),readBody:async req=>req.body,json:(res,status,data)=>Object.assign(res,{status,data})});
 const request=async(path,body)=>{const res={};await routes[(body?'POST ':'GET ')+'/api/life/'+path.split('?')[0]]({url:'/api/life/'+path,body},res);return res};
 return {db,accounts,request};
}
test('legacy followers without a lifestyle profile appear and totals equal visible unique rows',async()=>{
 const {request,db}=fixture();
 const detail=await request('people?id=me'),list=await request('people?relation=followers');
 assert.equal(detail.data.person.followers,3);assert.equal(list.data.total,3);assert.equal(list.data.people.length,3);
 assert.equal(list.data.people.find(p=>p.id==='new').nickname,'注册昵称-new');
 assert.equal(Object.hasOwn(db.people,'new'),false,'reads do not rewrite legacy records');
 assert.equal(detail.data.person.followingCount,1);
 assert.equal((await request('people?relation=following')).data.total,1);
 assert.equal(list.data.people.some(p=>p.id==='disabled'||p.id==='deleted'||p.id==='me'),false);
 assert.equal(JSON.stringify(list.data).includes('disabled'),false);
});
test('both block directions apply equally to follower totals and list; search does not alter global totals',async()=>{
 const {request,db}=fixture();db.blocks.me=['a'];db.blocks.b=['me'];
 assert.equal((await request('people?id=me')).data.person.followers,1);
 const list=await request('people?relation=followers');assert.deepEqual(list.data.people.map(p=>p.id),['new']);
 assert.equal((await request('people?relation=followers&q=不存在')).data.total,0);
 assert.equal((await request('people?id=me')).data.person.followers,1);
});
test('following for the first time initializes only the public nickname and is idempotent',async()=>{
 const {request,db}=fixture();delete db.people.me;
 await request('follow',{id:'new',following:true});await request('follow',{id:'new',following:true});
 assert.equal(db.people.me.profile.nickname,'我');assert.equal(db.follows.me.filter(id=>id==='new').length,1);
 assert.equal((await request('people?relation=following')).data.people.some(p=>p.id==='new'),true);
});
test('follower pagination includes accounts without profiles with a stable total',async()=>{
 const {request,db,accounts}=fixture();
 for(let i=0;i<34;i++){const id='extra'+i;accounts.set(id,{id,name:id});db.follows[id]=['me']}
 const first=await request('people?relation=followers'),next=await request('people?relation=followers&page=1');
 assert.equal(first.data.total,37);assert.equal(first.data.people.length,30);assert.equal(first.data.more,true);
 assert.equal(next.data.people.length,7);assert.equal(next.data.more,false);
 assert.equal(new Set([...first.data.people,...next.data.people].map(p=>p.id)).size,37);
});
