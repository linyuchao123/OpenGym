import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inviteAvailable,inviteInfo,consumeInvite} from '../shared/invitations.js';
test('one code expands from eight uses to one hundred without expiry or losing history',()=>{
 const uses=Array.from({length:8},(_,i)=>({uid:'u'+i,at:'2026-10-20'})),i={code:'fixture',maxUses:100,uses:[...uses],usedBy:'u7'};
 assert.equal(inviteInfo(i).remaining,92);assert.equal(inviteAvailable(i),true);
 for(let n=8;n<100;n++)consumeInvite(i,'u'+n,'2036-10-20');
 assert.equal(i.maxUses,100);assert.equal(inviteInfo(i).usedCount,100);assert.equal(inviteInfo(i).remaining,0);assert.deepEqual(i.uses.slice(0,8),uses);assert.equal(inviteAvailable(i),false);assert.throws(()=>consumeInvite(i,'u100','2036-10-20'));
});
test('legacy one-use records default to ten and revoked codes remain unavailable',()=>{
 const old={usedBy:'legacy'};assert.equal(inviteInfo(old).maxUses,10);consumeInvite(old,'next','2026-10-20');assert.equal(inviteInfo(old).usedCount,2);
 assert.equal(inviteAvailable({maxUses:100,revoked:true}),false);
});
