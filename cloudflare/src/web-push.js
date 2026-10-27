// RFC 8291 aes128gcm and RFC 8292 VAPID. Fixed provider allowlist, no arbitrary fetch targets.
const enc=new TextEncoder(),bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const cat=(...xs)=>{const out=new Uint8Array(xs.reduce((n,x)=>n+x.length,0));let i=0;for(const x of xs){out.set(x,i);i+=x.length}return out};
export function validEndpoint(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(['fcm.googleapis.com','updates.push.services.mozilla.com','wns2-am3p.notify.windows.com'].includes(u.hostname)||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com'))&&u.pathname.length>1&&value.length<2048}catch{return false}}
async function hkdf(ikm,salt,info,len){const key=await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,len*8))}
export async function pushRequest(subscription,payload,keys){
 if(!validEndpoint(subscription.endpoint))throw Error('Invalid endpoint');
 const ua=bytes(subscription.keys.p256dh),auth=bytes(subscription.keys.auth);if(ua.length!==65||auth.length!==16)throw Error('Invalid subscription');
 const ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),as=new Uint8Array(await crypto.subtle.exportKey('raw',ephemeral.publicKey));
 const recipient=await crypto.subtle.importKey('raw',ua,{name:'ECDH',namedCurve:'P-256'},false,[]),secret=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:recipient},ephemeral.privateKey,256));
 const ikm=await hkdf(secret,auth,cat(enc.encode('WebPush: info\0'),ua,as),32),salt=crypto.getRandomValues(new Uint8Array(16));
 const cek=await hkdf(ikm,salt,enc.encode('Content-Encoding: aes128gcm\0'),16),nonce=await hkdf(ikm,salt,enc.encode('Content-Encoding: nonce\0'),12);
 const message=cat(enc.encode(JSON.stringify(payload)),new Uint8Array([2]));if(message.length>3000)throw Error('Payload too large');
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']),message));
 const header=cat(salt,new Uint8Array([0,0,16,0,65]),as),body=cat(header,encrypted),pub=bytes(keys.publicKey);
 const jwk={kty:'EC',crv:'P-256',x:b64(pub.slice(1,33)),y:b64(pub.slice(33,65)),d:keys.privateKey};
 const jwtHeader=b64(enc.encode(JSON.stringify({typ:'JWT',alg:'ES256'}))),claims=b64(enc.encode(JSON.stringify({aud:new URL(subscription.endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:keys.subject}))),input=jwtHeader+'.'+claims;
 const signing=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']),sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signing,enc.encode(input));
 return {method:'POST',headers:{TTL:'300',Urgency:'normal','Content-Type':'application/octet-stream','Content-Encoding':'aes128gcm',Authorization:`vapid t=${input}.${b64(sig)}, k=${keys.publicKey}`},body,redirect:'error'};
}
export async function sendWebPush(sub,payload,keys){const init=await pushRequest(sub,payload,keys);return fetch(sub.endpoint,{...init,signal:AbortSignal.timeout(8000)})}
