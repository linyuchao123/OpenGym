// Legacy invitations default to ten; explicit limits preserve the original code and uses.
export const MAX_INVITE_USES=1000
export const inviteUsers=i=>[...new Set([...(Array.isArray(i?.uses)?i.uses.map(x=>x.uid):[]),...(i?.usedBy?[i.usedBy]:[])])]
export const inviteLimit=i=>Number.isInteger(i?.maxUses)&&i.maxUses>=1&&i.maxUses<=MAX_INVITE_USES?i.maxUses:10
export const inviteInfo=i=>({...i,maxUses:inviteLimit(i),usedCount:inviteUsers(i).length,remaining:Math.max(0,inviteLimit(i)-inviteUsers(i).length)})
export const inviteAvailable=i=>!!i&&!i.revoked&&inviteUsers(i).length<inviteLimit(i)
export function consumeInvite(i,uid,at){if(!inviteAvailable(i))throw Error('invite-full');i.uses=[...inviteUsers(i).map(id=>(i.uses||[]).find(x=>x.uid===id)||{uid:id,at:i.usedAt||null}),{uid,at}];i.usedBy=uid;i.usedAt=at;i.maxUses=inviteLimit(i)}

export function inviteLimitError(i,maxUses){
 if(!Number.isInteger(maxUses)||maxUses<1||maxUses>MAX_INVITE_USES)return `名额须为1至${MAX_INVITE_USES}的整数。`;
 if(maxUses<inviteUsers(i).length)return "总名额不能少于已使用人数。";
 return null;
}
