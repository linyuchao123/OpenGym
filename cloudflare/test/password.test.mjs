import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,validatePassword} from '../src/password.js';
test('password hashes are salted, normalized and never contain plaintext',async()=>{
 const pw='Orange-河流-Hike!78',a=await hashPassword(pw),b=await hashPassword(pw);
 assert.notEqual(a.salt,b.salt);assert.notEqual(a.hash,b.hash);assert.ok(!JSON.stringify(a).includes(pw));
 assert.equal(await verifyPassword(pw,a),true);assert.equal(await verifyPassword(pw+'x',a),false);assert.equal(await verifyPassword(pw,null),false);
 const composed=await hashPassword('Café-Train-long!8');assert.equal(await verifyPassword('Cafe\u0301-Train-long!8',composed),true);
});
test('weak and overlong passwords are rejected before hashing',()=>{
 for(const pw of ['short','1234567890','a'.repeat(300)])assert.throws(()=>validatePassword(pw,'fixture'));
});
