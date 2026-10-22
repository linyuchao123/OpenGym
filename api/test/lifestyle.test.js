import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
const apiDir=fileURLToPath(new URL('../',import.meta.url));
const jpg=fs.readFileSync(new URL('./fixtures/lifestyle-apple.jpg',import.meta.url));
async function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gym-life-test-'));const secret=crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(path.join(dir,'secret'),secret);
  fs.writeFileSync(path.join(dir,'db.json'),JSON.stringify({users:[{id:'alice',name:'小甲',admin:true},{id:'bob',name:'小乙'},{id:'eve',name:'其他成员'}],creds:[],subs:[],invites:[]}));
  let received;
  const model=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);received=JSON.parse(Buffer.concat(chunks));if(received.messages?.[0]?.content?.includes('健身计划助手')){const q=JSON.parse(received.messages[1].content[0].text),plan={direction:'maintain',summary:'以可控训练建立习惯',guidance:'循序渐进，出现疼痛时停止',sessions:q.intake.days.map(day=>({day,name:'全身训练',exercises:[{id:'0662',sets:2,reps:10,restSec:60},{id:'1197',sets:2,reps:10,restSec:60}]}))};res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(plan)}}]}))};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({items:[{name:'苹果',grams:180,calories:95,protein:.5,carbs:25,fat:.3,advice:'搭配其他食物更丰富。'}],mealAdvice:'可以按实际食欲搭配其他食物，单个水果不足以判断整餐。',mealStyle:'unknown',styleReason:'单一水果无法判断整餐搭配。',note:'分量仅为估计，请确认。'})}}]}))});
  await new Promise(r=>model.listen(0,'127.0.0.1',r));
  const child=spawn(process.execPath,['server.js'],{cwd:apiDir,env:{...process.env,PORT:'0',HOST:'127.0.0.1',DATA_DIR:dir,ORIGIN:'http://localhost:8080',FOOD_AI_API_KEY:'fixture-only',FOOD_AI_BASE_URL:`http://127.0.0.1:${model.address().port}`,COACH_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
  t.after(()=>{child.kill('SIGKILL');model.close();fs.rmSync(dir,{recursive:true,force:true})});
  const port=await boundPort(child,()=>logs);const base=`http://127.0.0.1:${port}`;
  const token=uid=>{const p=`${uid}:${Date.now()+86400000}:0`;return p+'.'+crypto.createHmac('sha256',secret).update(p).digest('base64url')};
  async function request(route,{user='alice',method='GET',body,raw,type}={}){
    const r=await fetch(base+'/api/life/'+route,{method,headers:{...(user?{Authorization:'Bearer '+token(user)}:{}),Origin:'http://localhost:8080',...(body?{'Content-Type':'application/json'}:{}),...(type?{'Content-Type':type}:{})},body:raw|| (body?JSON.stringify(body):undefined)});
    const data=r.headers.get('content-type')?.includes('json')?await r.json():await r.arrayBuffer();return {status:r.status,data,r};
  }
  return {request,base,token,dir,received:()=>received};
}
const meal={date:'2026-10-17',type:'lunch',items:[{name:'米饭',calories:200,grams:150,protein:4,carbs:45,fat:.4}]};
test('a fresh account following before saving a profile appears in the follower list and survives reload',async t=>{
 const h=await fixture(t);
 await h.request('profile',{method:'PUT',body:{nickname:'主页主人'}});
 assert.equal((await h.request('follow',{user:'bob',method:'POST',body:{id:'alice',following:true}})).status,200);
 const profile=(await h.request('people?id=alice')).data.person;
 const list=(await h.request('people?relation=followers')).data;
 assert.equal(profile.followers,1);assert.equal(list.total,1);assert.equal(list.people.length,1);assert.equal(list.people[0].nickname,'小乙');
 assert.equal((await h.request('people?id=bob')).data.person.nickname,'小乙');
 const saved=JSON.parse(fs.readFileSync(path.join(h.dir,'lifestyle','records.json'),'utf8'));
 assert.equal(saved.people.bob.profile.nickname,'小乙');assert.deepEqual(saved.follows.bob,['alice']);
});
test('nutrition stays private, uploads require ownership, and records persist to disk',async t=>{
  const h=await fixture(t);
  assert.equal((await h.request('me',{user:null})).status,401);
  assert.equal((await h.request('feed',{user:null})).status,401);
  const uploaded=await h.request('upload',{method:'POST',raw:jpg,type:'image/jpeg'});assert.equal(uploaded.status,200);const id=uploaded.data.id;
  assert.equal((await h.request('asset?id='+id,{user:'bob'})).status,404);
  assert.equal((await h.request('meal',{method:'POST',body:{...meal,photo:id}})).status,200);
  assert.equal((await h.request('me')).data.meals.length,1);
  assert.equal((await h.request('me',{user:'bob'})).data.meals.length,0);
  assert.equal((await h.request('meal',{user:'bob',method:'POST',body:{...meal,photo:id}})).status,400);
  assert.equal((await h.request('meal',{method:'POST',body:{...meal,date:'2026-02-30'}})).status,400);
  assert.equal((await h.request('meal',{method:'POST',body:{...meal,items:[null]}})).status,400);
  assert.equal((await h.request('upload',{method:'POST',raw:Buffer.from('<html>bad</html>'),type:'image/jpeg'})).status,400);
  const saved=JSON.parse(fs.readFileSync(path.join(h.dir,'lifestyle/records.json')));assert.equal(saved.people.alice.meals[0].items[0].calories,200);
  const range=await fetch(h.base+'/api/life/asset?id='+id,{headers:{Authorization:'Bearer '+h.token('alice'),Range:'bytes=0-9'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,10);
  const badRange=await fetch(h.base+'/api/life/asset?id='+id,{headers:{Authorization:'Bearer '+h.token('alice'),Range:'bytes=9999999-'}});assert.equal(badRange.status,416);
});
test('two accounts share posts, idempotent likes, comments and real reposts; only the owner can delete',async t=>{
  const h=await fixture(t);const {id}= (await h.request('upload',{method:'POST',raw:jpg,type:'image/jpeg'})).data;
  const post=(await h.request('post',{method:'POST',body:{text:'今天完成训练！',media:[id]}})).data.post;
  assert.equal((await h.request('asset?id='+id,{user:'bob'})).status,200);
  assert.equal((await h.request('feed',{user:'bob'})).data.posts[0].text,'今天完成训练！');
  for(let i=0;i<2;i++)assert.equal((await h.request('react',{user:'bob',method:'POST',body:{id:post.id,action:'like',liked:true}})).status,200);
  await h.request('react',{user:'bob',method:'POST',body:{id:post.id,action:'comment',comment:'一起加油！'}});
  let feed=(await h.request('feed')).data.posts;assert.equal(feed[0].likeCount,1);assert.equal(feed[0].comments[0].text,'一起加油！');
  assert.equal((await h.request('react',{user:'bob',method:'POST',body:{id:post.id,action:'delete'}})).status,403);
  const repost=await h.request('post',{user:'bob',method:'POST',body:{repostOf:post.id}});assert.equal(repost.status,200);
  feed=(await h.request('feed')).data.posts;assert.equal(feed.find(p=>p.id===post.id).shareCount,1);assert.equal(feed.find(p=>p.uid==='bob').original.text,'今天完成训练！');
  assert.equal((await h.request('feed?author=bob')).data.posts.length,1);
  await h.request('react',{method:'POST',body:{id:post.id,action:'delete'}});
  assert.equal((await h.request('feed')).data.posts[0].originalDeleted,true);
  assert.equal((await h.request('asset?id='+id,{user:'bob'})).status,404);
});
test('vision sends actual image blocks and never records an estimate before the user confirms it',async t=>{
  const h=await fixture(t);const {id}=(await h.request('upload',{method:'POST',raw:jpg,type:'image/jpeg'})).data;
  assert.equal((await h.request('recognize',{user:'bob',method:'POST',body:{photo:id}})).status,400);
  const result=await h.request('recognize',{method:'POST',body:{photo:id,hint:'一个苹果'}});assert.equal(result.status,200);assert.equal(result.data.estimated,true);assert.equal(result.data.items[0].calories,95);assert.equal(result.data.mealStyle,'unknown');assert.ok(result.data.styleReason);assert.ok(result.data.items[0].advice);
  assert.equal(h.received().model,'deepseek-flash');assert.ok(h.received().messages[1].content[1].image_url.url.startsWith('data:image/jpeg;base64,'));
  assert.equal((await h.request('me')).data.meals.length,0);
  const saved=await h.request('meal',{method:'POST',body:{...meal,photo:id,items:result.data.items,source:'ai-reviewed'}});assert.equal(saved.status,200);assert.equal((await h.request('me')).data.meals[0].source,'ai-reviewed');
});
test('uploaded video is listed as video and supports byte ranges for iPhone playback',async t=>{
  const h=await fixture(t);const video=fs.readFileSync(new URL('./fixtures/lifestyle-video.mp4',import.meta.url));
  const upload=await h.request('upload',{method:'POST',raw:video,type:'video/mp4'});assert.equal(upload.status,200);
  const id=upload.data.id;const post=await h.request('post',{method:'POST',body:{text:'视频播放测试',media:[id]}});assert.deepEqual(post.data.post.videoIds,[id]);
  const r=await fetch(h.base+'/api/life/asset?id='+id,{headers:{Authorization:'Bearer '+h.token('bob'),Range:'bytes=0-1023'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-type'),'video/mp4');assert.equal((await r.arrayBuffer()).byteLength,1024);
});
test('members follow each other, private messages are participant-only, blocking stops chat and feed visibility',async t=>{
  const h=await fixture(t)
  for(const [user,nickname] of [['alice','小甲'],['bob','小乙']])assert.equal((await h.request('profile',{user,method:'PUT',body:{nickname}})).status,200)
  assert.equal((await h.request('follow',{method:'POST',body:{id:'__proto__',following:true}})).status,400)
  const bob=(await h.request('people')).data.people[0];assert.equal(bob.id,'bob');assert.equal('meals' in bob,false);assert.equal('calorieGoal' in bob,false)
  assert.equal((await h.request('message',{method:'POST',body:{to:'bob',text:'你好'}})).status,403)
  for(let i=0;i<2;i++)await h.request('follow',{method:'POST',body:{id:'bob',following:true}})
  assert.equal((await h.request('people?id=bob')).data.person.followers,1)
  await h.request('post',{user:'bob',method:'POST',body:{text:'小乙训练'}})
  assert.equal((await h.request('feed?following=1')).data.posts.length,1)
  assert.equal((await h.request('feed?following=1',{user:'bob'})).data.posts.length,0)
  await h.request('follow',{user:'bob',method:'POST',body:{id:'alice',following:true}})
  const send=()=>h.request('message',{method:'POST',body:{to:'bob',text:'今天练得如何？',clientId:'retry-key'}})
  const sent=await send();assert.equal(sent.status,200);assert.equal((await send()).data.message.id,sent.data.message.id)
  assert.equal((await h.request('messages?with=bob')).data.messages.length,1)
  assert.equal((await h.request('inbox',{user:'bob'})).data.conversations[0].unread,1)
  // Neither reading the sender's own view nor marking it can mark Bob's incoming message read.
  await h.request('messages/read',{method:'POST',body:{with:'bob',through:sent.data.message.id}})
  assert.equal((await h.request('inbox',{user:'bob'})).data.conversations[0].unread,1)
  await h.request('messages/read',{user:'bob',method:'POST',body:{with:'alice',through:sent.data.message.id}})
  assert.equal((await h.request('inbox',{user:'bob'})).data.conversations[0].unread,0)
  // A known third account has no access by supplying somebody else's conversation cursor.
  assert.equal((await h.request('messages?with=alice',{user:'eve'})).data.messages.length,0)
  assert.equal((await h.request('inbox',{user:'eve'})).data.conversations.length,0)
  assert.equal((await h.request('messages?with=alice&before='+sent.data.message.id,{user:'eve'})).status,400)
  assert.equal((await h.request('messages/read',{user:'eve',method:'POST',body:{with:'alice',through:sent.data.message.id}})).status,400)
  await h.request('block',{user:'bob',method:'POST',body:{id:'alice',blocked:true}})
  assert.equal((await send()).status,403)
  assert.equal((await h.request('messages?with=bob')).status,403)
  assert.equal((await h.request('feed')).data.posts.length,0)
  assert.equal((await h.request('people?blocked=1',{user:'bob'})).data.people[0].id,'alice')
  await h.request('block',{user:'bob',method:'POST',body:{id:'alice',blocked:false}})
  assert.equal((await h.request('messages?with=bob')).data.person.canChat,false)
  assert.equal((await h.request('people?id=bob')).data.person.following,false)
})
test('meal style and per-dish advice persist without accepting arbitrary style values',async t=>{
  const h=await fixture(t)
  const saved=await h.request('meal',{method:'POST',body:{...meal,mealStyle:'fat-loss',styleReason:'清淡搭配，仅供参考',items:[{...meal.items[0],advice:'搭配蔬菜和蛋白质更丰富。'}]}})
  assert.equal(saved.data.meal.mealStyle,'fat-loss');assert.equal(saved.data.meal.items[0].advice,'搭配蔬菜和蛋白质更丰富。')
  const invalid=await h.request('meal',{method:'POST',body:{...meal,mealStyle:'medical-diagnosis'}});assert.equal(invalid.data.meal.mealStyle,'unknown')
  assert.equal((await h.request('me',{user:'bob'})).data.meals.length,0)
})
test('favorite meals persist privately, strip old dates and photos, and never create a diet record until confirmed',async t=>{
 const h=await fixture(t)
 assert.equal((await h.request('template',{user:null,method:'POST',body:{...meal,name:'我的早餐'}})).status,401)
 const saved=await h.request('template',{method:'POST',body:{...meal,name:'我的早餐',photo:'old-photo',source:'ai-reviewed'}})
 assert.equal(saved.status,200);const template=saved.data.template;assert.equal(template.date,undefined);assert.equal(template.photo,undefined)
 assert.equal((await h.request('me')).data.meals.length,0);assert.equal((await h.request('me')).data.templates.length,1)
 assert.equal((await h.request('me',{user:'bob'})).data.templates.length,0)
 assert.equal((await h.request('template',{user:'bob',method:'POST',body:{...template,name:'尝试修改'}})).status,404)
 await h.request('template',{user:'bob',method:'DELETE',body:{id:template.id}})
 assert.equal((await h.request('me')).data.templates.length,1)
 assert.equal((await h.request('template',{method:'POST',body:{...meal,name:'',items:[]}})).status,400)
 const disk=JSON.parse(fs.readFileSync(path.join(h.dir,'lifestyle/records.json')));assert.equal(disk.people.alice.templates[0].name,'我的早餐')
 await h.request('template',{method:'DELETE',body:{id:template.id}});assert.equal((await h.request('me')).data.templates.length,0)
})
test('community categories, topics, bookmarks and notifications are scoped to each viewer',async t=>{
 const h=await fixture(t)
 const a=(await h.request('post',{method:'POST',body:{text:'练腿打卡',category:'workout',tags:['练腿','力量']}})).data.post
 await h.request('post',{method:'POST',body:{text:'晚餐',category:'nutrition',tags:['早餐']}})
 assert.equal((await h.request('feed?category=workout')).data.posts.length,1)
 assert.equal((await h.request('feed?tag='+encodeURIComponent('练腿'))).data.posts[0].id,a.id)
 assert.equal((await h.request('feed?q='+encodeURIComponent('练腿'))).data.posts.length,1)
 await h.request('bookmark',{user:'bob',method:'POST',body:{id:a.id,saved:true}})
 assert.equal((await h.request('feed?saved=1',{user:'bob'})).data.posts.length,1)
 assert.equal((await h.request('feed?saved=1')).data.posts.length,0)
 await h.request('react',{user:'bob',method:'POST',body:{id:a.id,action:'like',liked:true}})
 await h.request('react',{user:'bob',method:'POST',body:{id:a.id,action:'comment',comment:'加油'}})
 const own=(await h.request('notifications')).data;assert.equal(own.items.length,2);assert.equal((await h.request('notifications',{user:'eve'})).data.items.length,0)
 await h.request('notifications/read',{user:'bob',method:'POST',body:{id:own.items[0].id}});assert.equal((await h.request('notifications')).data.unread,2)
 await h.request('notifications/prefs',{method:'PUT',body:{muted:true}});assert.equal((await h.request('notifications')).data.unread,0)
 await h.request('block',{method:'POST',body:{id:'bob',blocked:true}});assert.equal((await h.request('notifications')).data.items.length,0)
 assert.equal((await h.request('feed?saved=1',{user:'bob'})).data.posts.length,0)
})
test('challenges share only aggregate progress after joining and only their owner may close them',async t=>{
 const h=await fixture(t);const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date())
 fs.writeFileSync(path.join(h.dir,'state-alice.json'),JSON.stringify({workouts:[{id:'w1',d:today},{id:'w2',d:'2099-01-01'}]}))
 const c=(await h.request('challenge',{method:'POST',body:{title:'一起记录',kind:'training',target:3,start:today,end:today}})).data.challenge
 assert.equal(c.participants[0].count,1);assert.equal(c.participants[0].person.meals,undefined)
 const before=(await h.request('challenges',{user:'bob'})).data.challenges[0];assert.deepEqual(before.participants,[])
 await h.request('challenge/join',{user:'bob',method:'POST',body:{id:c.id,join:true,members:['eve']}})
 assert.equal((await h.request('challenges',{user:'bob'})).data.challenges[0].participants.length,2)
 assert.equal((await h.request('challenge/close',{user:'bob',method:'POST',body:{id:c.id}})).status,403)
 await h.request('challenge/close',{method:'POST',body:{id:c.id}})
 assert.equal((await h.request('challenge/join',{user:'eve',method:'POST',body:{id:c.id,join:true}})).status,400)
 assert.equal((await h.request('challenge',{method:'POST',body:{title:'错误',kind:'food-days',target:7,start:today,end:today}})).status,400)
})
test('queued meal retries are idempotent, reject changed payloads and detect stale edits',async t=>{
 const h=await fixture(t);const body={...meal,clientId:'offline-same-key'}
 const saved=(await h.request('meal',{method:'POST',body})).data.meal
 assert.equal((await h.request('meal',{method:'POST',body})).data.meal.id,saved.id)
 assert.equal((await h.request('me')).data.meals.length,1)
 assert.equal((await h.request('meal',{method:'POST',body:{...body,items:[{name:'不同食物',calories:300}]}})).status,409)
 assert.equal((await h.request('meal',{method:'POST',body:{...saved,note:'修改',baseUpdatedAt:saved.updatedAt-1}})).status,409)
 const edit=await h.request('meal',{method:'POST',body:{...saved,note:'用户确认修改',baseUpdatedAt:saved.updatedAt}});assert.equal(edit.status,200);assert.equal(edit.data.meal.note,'用户确认修改')
})
test('restoration validates everything before appending, never overwrites and never imports foreign media',async t=>{
 const h=await fixture(t);const body={type:'opengym-lifestyle',version:2,meals:[{...meal,id:'restore-1',photo:'foreign'}],templates:[]}
 const first=await h.request('restore',{method:'POST',body});assert.equal(first.status,200);assert.equal(first.data.meals,1);assert.equal((await h.request('me')).data.meals[0].photo,'')
 assert.equal((await h.request('restore',{method:'POST',body})).data.meals,0)
 assert.equal((await h.request('restore',{method:'POST',body:{...body,meals:[{...meal,id:'valid'},{...meal,id:'invalid',date:'2026-02-30'}]}})).status,400)
 assert.equal((await h.request('me')).data.meals.length,1);assert.equal((await h.request('me',{user:'bob'})).data.meals.length,0)
})
test('whole-meal AI advice uses the stored goal and does not auto-save or expose profile data',async t=>{
 const h=await fixture(t);await h.request('profile',{method:'PUT',body:{nickname:'小甲',fitnessGoal:'loss',publicAchievements:'完成十次训练',calorieGoal:2000}})
 const advice=await h.request('advice',{method:'POST',body:{items:meal.items}});assert.equal(advice.status,200);assert.ok(advice.data.mealAdvice);assert.equal(JSON.parse(h.received().messages[1].content).goal,'loss');assert.equal((await h.request('me')).data.meals.length,0)
 const member=(await h.request('people?id=alice',{user:'bob'})).data.person;assert.equal(member.publicAchievements,'完成十次训练');assert.equal(member.calorieGoal,undefined);assert.equal(member.fitnessGoal,undefined)
})
test('creator music metadata, MP3 privacy, replies, comment likes and retry deduplication',async t=>{
 const h=await fixture(t);
 const tracks=(await h.request('music?q=力量')).data.tracks;assert.equal(tracks.length,1);assert.equal(tracks[0].id,'momentum');
 const mp3=fs.readFileSync(new URL('../../frontend/public/music/momentum.mp3',import.meta.url));
 const a=await h.request('upload',{method:'POST',raw:mp3,type:'audio/mpeg'});assert.equal(a.status,200);
 assert.equal((await h.request('asset?id='+a.data.id,{user:'bob'})).status,404);
 const create=await h.request('post',{method:'POST',body:{text:'配乐作品',music:{assetId:a.data.id,start:2,duration:12},effects:{filter:'warm',sticker:'加油💪',brightness:1.2}}});assert.equal(create.status,200);const p=create.data.post;assert.equal(p.music.start,2);assert.equal(p.effects.filter,'warm');
 assert.equal((await h.request('asset?id='+a.data.id,{user:'bob'})).status,200);
 assert.equal((await h.request('post',{user:'bob',method:'POST',body:{text:'盗用',music:{assetId:a.data.id}}})).status,400);
 const send=(user,text,clientId,replyTo)=>h.request('comment',{user,method:'POST',body:{postId:p.id,text,clientId,replyTo}});
 const c=(await send('bob','很棒','one')).data.comment;assert.ok(c.id);
 assert.equal((await send('bob','很棒','one')).data.comment.id,c.id);assert.equal((await send('bob','改了','one')).status,409);
 const reply=(await send('alice','谢谢！','two',c.id)).data.comment;assert.equal(reply.parentId,c.id);
 const deep=(await send('eve','一起加油','three',reply.id)).data.comment;assert.equal(deep.parentId,c.id);assert.equal(deep.replyTo,reply.id);
 for(let i=0;i<2;i++)assert.equal((await h.request('comment/react',{method:'POST',body:{postId:p.id,id:c.id,action:'like',liked:true}})).data.comment.likeCount,1);
 const page=(await h.request('comments?post='+p.id)).data;assert.equal(page.items.length,1);assert.equal(page.items[0].replyCount,2);assert.equal(page.total,3);
 assert.equal((await h.request('comments?post='+p.id+'&parent='+c.id)).data.items.length,2);
 assert.equal((await h.request('comment/react',{user:'eve',method:'POST',body:{postId:p.id,id:c.id,action:'delete'}})).status,403);
 await h.request('comment/react',{user:'bob',method:'POST',body:{postId:p.id,id:c.id,action:'delete'}});
 const deleted=(await h.request('comments?post='+p.id)).data.items[0];assert.equal(deleted.deleted,true);assert.equal(deleted.text,'评论已删除');
 await h.request('block',{method:'POST',body:{id:'bob',blocked:true}});
 assert.equal((await h.request('comments?post='+p.id,{user:'bob'})).status,404);
 assert.equal((await h.request('asset?id='+a.data.id,{user:'bob'})).status,404);
});
test('comment pagination is bounded and compact feed keeps old full-comment clients compatible',async t=>{
 const h=await fixture(t);const p=(await h.request('post',{method:'POST',body:{text:'分页检查'}})).data.post;
 for(let i=0;i<21;i++){const r=await h.request('comment',{user:'bob',method:'POST',body:{postId:p.id,text:'鼓励 '+i,clientId:'page-'+i}});assert.equal(r.status,200)}
 const first=(await h.request('comments?post='+p.id)).data;assert.equal(first.items.length,20);assert.equal(first.next,20);
 const second=(await h.request('comments?post='+p.id+'&offset=20')).data;assert.equal(second.items.length,1);assert.equal(second.next,null);
 assert.equal((await h.request('feed')).data.posts[0].comments.length,21);
 const compact=(await h.request('feed?compact=1')).data.posts[0];assert.equal(compact.comments.length,3);assert.equal(compact.commentCount,21);assert.equal('clientId' in compact.comments[0],false);
});

test('body profile is private by default, explicit public fields are whitelisted and planner photos are never persisted',async t=>{
 const h=await fixture(t),profile={nickname:'甲',personality:'安静慢热',heightCm:175,weightKg:70,bodyContext:'adult'};
 assert.equal((await h.request('profile',{method:'PUT',body:profile})).status,200);
 let publicUser=(await h.request('people?id=alice',{user:'bob'})).data.person;assert.equal(publicUser.heightCm,undefined);assert.equal(publicUser.weightKg,undefined);assert.equal(publicUser.personality,undefined);
 await h.request('profile',{method:'PUT',body:{...profile,visibility:{height:true,bmi:true,personality:true}}});publicUser=(await h.request('people?id=alice',{user:'bob'})).data.person;assert.equal(publicUser.heightCm,175);assert.equal(publicUser.weightKg,undefined);assert.equal(publicUser.personality,'安静慢热');assert.equal(publicUser.bmi,22.9);
 assert.equal((await h.request('profile',{method:'PUT',body:{...profile,heightCm:999}})).status,400);
 const intake={adult:true,place:'home',experience:'beginner',days:[1,3],equipment:[],minutes:30};
 assert.equal((await h.request('fitness-plan',{method:'POST',body:{intake}})).status,400);
 const photo='data:image/jpeg;base64,'+jpg.toString('base64'),r=await h.request('fitness-plan',{method:'POST',body:{intake,consent:true,photos:[{kind:'current',data:photo}]}});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.plan.sessions.length,2);assert.equal(JSON.parse(h.received().messages[1].content[0].text).physical.weightKg,70);
 const saved=fs.readFileSync(path.join(h.dir,'lifestyle/records.json'),'utf8');assert.ok(!saved.includes(jpg.toString('base64')));assert.ok(!JSON.stringify(h.received()).includes('安静慢热'));
});

test('unread badge counts actual messages once and honors read and mute state',async t=>{const h=await fixture(t);await h.request('profile',{method:'PUT',body:{nickname:'甲'}});await h.request('profile',{user:'bob',method:'PUT',body:{nickname:'乙'}});await h.request('follow',{method:'POST',body:{id:'bob',following:true}});await h.request('follow',{user:'bob',method:'POST',body:{id:'alice',following:true}});const sent=await h.request('message',{user:'bob',method:'POST',body:{to:'alice',text:'加油',clientId:'badge-message'}});assert.equal(sent.status,200);let count=await h.request('unread');assert.equal(count.data.messages,1);assert.equal(count.data.total,2);await h.request('messages/read',{method:'POST',body:{with:'bob',through:sent.data.message.id}});assert.equal((await h.request('unread')).data.messages,0);await h.request('notifications/prefs',{method:'PUT',body:{muted:true}});assert.equal((await h.request('unread')).data.total,0)});

test('refresh weight sync preserves saved identity and rejects stale manual edits',async t=>{const h=await fixture(t),avatar='data:image/jpeg;base64,'+jpg.toString('base64');const first=await h.request('profile',{method:'PUT',body:{nickname:'测试资料',bio:'第一行\n第二行',avatar,heightCm:183,personality:'慢热 ENFP',weightKg:74,bodyContext:'adult',visibility:{height:true}}});assert.equal(first.status,200);const before=first.data.profile;const sync=await h.request('profile',{method:'PATCH',body:{weightKg:75,bodyUpdatedAt:Date.now()+100}});assert.equal(sync.status,200);assert.equal(sync.data.profile.bio,before.bio);assert.equal(sync.data.profile.avatar,avatar);assert.equal(sync.data.profile.heightCm,183);assert.equal(sync.data.profile.version,before.version);assert.equal((await h.request('me')).data.profile.bio,before.bio);const legacy=await h.request('profile',{method:'PUT',body:{weightKg:76}});assert.equal(legacy.data.profile.avatar,avatar);assert.equal(legacy.data.profile.heightCm,183);const conflict=await h.request('profile',{method:'PUT',body:{baseProfileVersion:before.version,bio:'过时编辑'}});assert.equal(conflict.status,409);assert.equal((await h.request('me')).data.profile.bio,before.bio);assert.equal((await h.request('profile',{method:'PATCH',body:{weightKg:78,bodyUpdatedAt:Date.now(),bio:'不得修改'}})).status,400);assert.equal((await h.request('music/connection',{user:'bob'})).status,403);assert.equal((await h.request('music/connection/test',{user:'bob',method:'POST',body:{}})).status,403);const connection=await h.request('music/connection/test',{method:'POST',body:{}});assert.equal(connection.data.stage,'configuration');assert.equal(connection.data.ok,false)});

test('opening message center acknowledges its snapshot including DMs, preserving later arrivals and other accounts',async t=>{
 const h=await fixture(t);
 await h.request('follow',{method:'POST',body:{id:'bob',following:true}});
 await h.request('follow',{user:'bob',method:'POST',body:{id:'alice',following:true}});
 await h.request('message',{user:'bob',method:'POST',body:{to:'alice',text:'进入前的私信',clientId:'before-center'}});
 const snapshot=(await h.request('notifications')).data;
 assert.ok(snapshot.readThrough.notification);assert.ok(snapshot.readThrough.message);
 await h.request('message',{user:'bob',method:'POST',body:{to:'alice',text:'刚收到的新私信',clientId:'after-center'}});
 await h.request('follow',{user:'eve',method:'POST',body:{id:'alice',following:true}});
 assert.equal((await h.request('notifications/read',{user:'bob',method:'POST',body:{through:snapshot.readThrough}})).status,400);
 assert.equal((await h.request('notifications/read',{method:'POST',body:{through:snapshot.readThrough}})).status,200);
 const count=(await h.request('unread')).data;assert.equal(count.messages,1);assert.equal(count.interactions,1);assert.equal(count.total,2);
 const rows=(await h.request('messages?with=bob')).data.messages;
 assert.ok(rows.find(m=>m.clientId==='before-center').readAt);assert.equal(rows.find(m=>m.clientId==='after-center').readAt,null);
 assert.equal((await h.request('unread',{user:'bob'})).data.interactions,1);
 const next=(await h.request('notifications')).data;
 await h.request('notifications/read',{method:'POST',body:{through:next.readThrough}});
 assert.equal((await h.request('unread')).data.total,0);
 assert.equal((await h.request('messages?with=bob')).data.messages.length,2);
});
