import {timingSafeEqual} from 'node:crypto';
import {passwordProblem,nameKey,normalizeEmail} from '../../api/password.js';
import {HttpError} from './repository.js';
export {nameKey,normalizeEmail};
// Native WebCrypto avoids a JavaScript KDF in the Workers CPU budget. The runtime
// caps PBKDF2 at 100,000 iterations; use SHA-512, random salts and persistent throttles.
const iterations=100000;
const derive=async(password,salt)=>{
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(password).normalize('NFKC')),'PBKDF2',false,['deriveBits']);
 return Buffer.from(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-512',salt,iterations},key,256));
};
export function validatePassword(password,name){const problem=passwordProblem(password,name);if(problem)throw new HttpError(400,'密码至少10个字符，请避免常见密码。',problem)}
export async function hashPassword(password){const salt=crypto.getRandomValues(new Uint8Array(16));return {v:1,kdf:'pbkdf2-sha512',iterations,salt:Buffer.from(salt).toString('base64'),hash:(await derive(password,salt)).toString('base64')}}
export async function verifyPassword(password,stored){
 const valid=stored?.v===1&&stored.kdf==='pbkdf2-sha512'&&stored.iterations===iterations&&typeof stored.salt==='string'&&typeof stored.hash==='string';
 if(typeof password!=='string'||password.length>1024)return false;
 const salt=valid?Buffer.from(stored.salt,'base64'):new Uint8Array(16),expected=valid?Buffer.from(stored.hash,'base64'):Buffer.alloc(32);
 const actual=await derive(password,salt);return valid&&expected.length===actual.length&&timingSafeEqual(actual,expected);
}
