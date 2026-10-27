import {test} from 'node:test';import assert from 'node:assert/strict';
import {pushRequest,validEndpoint} from '../src/web-push.js';

const b64=b=>Buffer.from(b).toString('base64url');
test('Web Push payload decrypts as RFC8291 and VAPID signature verifies',async()=>{
 const recipient=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),pub=new Uint8Array(await crypto.subtle.exportKey('raw',recipient.publicKey)),auth=crypto.getRandomValues(new Uint8Array(16)),vapid=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',vapid.privateKey),keys={publicKey:b64(await crypto.subtle.exportKey('raw',vapid.publicKey)),privateKey:jwk.d};
 const req=await pushRequest({endpoint:'https://web.push.apple.com/example',keys:{p256dh:b64(pub),auth:b64(auth)}},{title:'训练提醒'}, {...keys,subject:'https://example.com'}),body=req.body,salt=body.slice(0,16),as=body.slice(21,86),encrypted=body.slice(86);
 const hk=async(ikm,salt,info,n)=>new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']),n*8));
 const secret=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:await crypto.subtle.importKey('raw',as,{name:'ECDH',namedCurve:'P-256'},false,[])},recipient.privateKey,256)),e=new TextEncoder(),ikm=await hk(secret,auth,new Uint8Array([...e.encode('WebPush: info\0'),...pub,...as]),32),cek=await hk(ikm,salt,e.encode('Content-Encoding: aes128gcm\0'),16),nonce=await hk(ikm,salt,e.encode('Content-Encoding: nonce\0'),12),plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']),encrypted));
 assert.equal(plain.at(-1),2);assert.equal(JSON.parse(new TextDecoder().decode(plain.slice(0,-1))).title,'训练提醒');assert.equal(req.redirect,'error');
 const token=req.headers.Authorization.match(/t=([^,]+)/)[1],parts=token.split('.'),pk=await crypto.subtle.importKey('raw',Buffer.from(keys.publicKey,'base64url'),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);assert(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pk,Buffer.from(parts[2],'base64url'),e.encode(parts[0]+'.'+parts[1])));
});
test('push endpoints reject local, credentials, lookalikes and non-HTTPS',()=>{for(const x of ['http://fcm.googleapis.com/a','https://localhost/a','https://fcm.googleapis.com.attacker.org/a','https://u:p@fcm.googleapis.com/a','https://fcm.googleapis.com:444/a'])assert.equal(validEndpoint(x),false);assert.equal(validEndpoint('https://updates.push.services.mozilla.com/wpush/v2/a'),true)});
import {pushRoute,duePush,messagePush} from '../src/push-service.js';
function memoryRepo(){const store=new Map();return {store,read:async(s,id)=>store.get(s+':'+id)||null,loadRecord:async(s,id)=>({scope:s,id}),save:async(s,rows)=>{if(rows.size)store.set(s.scope+':'+s.id,JSON.parse([...rows.values()][0]));else store.delete(s.scope+':'+s.id)},db:{prepare:()=>({bind:()=>({first:async()=>({n:0}),all:async()=>({results:[]})})})}}}
test('notification preferences are opt-in, user scoped, validate time, and preserve independent choices',async()=>{
 const repo=memoryRepo(),env={WEB_PUSH_PUBLIC_KEY:'fixture',WEB_PUSH_PRIVATE_KEY:'fixture'},u={id:'alice'},url=new URL('https://example.com/api/push/preferences');
 assert.deepEqual((await pushRoute(repo,env,u,'GET /api/push/preferences',{},url)).preferences,{messages:false,reminderAt:null});
 const at=Date.now()+600000;await pushRoute(repo,env,u,'PUT /api/push/preferences',{messages:true,reminderAt:at,tz:'Asia/Shanghai'},url);
 assert.equal((await repo.read('push-prefs','alice')).reminderAt,at);assert.equal(await repo.read('push-prefs','bob'),null);
 await assert.rejects(pushRoute(repo,env,u,'PUT /api/push/preferences',{messages:true,reminderAt:Date.now()-1},url),/请选择/);
 await assert.rejects(pushRoute(repo,env,u,'PUT /api/push/preferences',{messages:true,reminderAt:null,tz:'invalid'},url),/时区/);
 await pushRoute(repo,env,u,'PUT /api/push/preferences',{messages:false,reminderAt:null},url);assert.equal((await repo.read('push-prefs','alice')).messages,false);
 await assert.rejects(pushRoute(repo,{},u,'GET /api/push/public-key',{},url),/尚未配置/);
});
test('private messages do not attempt delivery before explicit opt in',async()=>{const repo=memoryRepo();await messagePush(repo,{}, {to:'bob'});await duePush(repo,{});assert.equal(repo.store.size,0)});
