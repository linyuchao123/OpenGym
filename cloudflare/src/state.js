import {stampEffectiveSaves} from '../../api/shared/usage-metrics.js';
import {stampPut} from '../../api/sync-stamps.js';
import {HttpError} from './repository.js';
export const forClient=s=>{if(!s)return s;const {_unstamped,_prior,...rest}=s;return rest};
export function prepareState(cur,body){
 const state=body.state,rev=cur?._rev||0;
 if(!state||typeof state!=='object'||Array.isArray(state)||!Object.keys(state).some(k=>k!=='_rev'&&k!=='_ts')||['workouts','routines'].some(k=>state[k]!=null&&!Array.isArray(state[k])))throw new HttpError(400,'训练数据格式不正确。');
 if(body.baseRev!=null&&(body.baseRev!==rev||(typeof body.baseWid==='string'&&cur?._wid&&body.baseWid!==cur._wid)))throw Object.assign(new HttpError(409,'conflict','conflict'),{data:{rev,state:forClient(cur)}});
 for(const k of ['workouts','routines'])if(Array.isArray(state[k]))state[k]=state[k].filter(v=>v&&typeof v==='object'&&!Array.isArray(v));
 delete state.active;
 if((Number(cur?.resetAt)||0)>(Number(state.resetAt)||0)){state.resetAt=cur.resetAt;if(cur.resetIds&&typeof cur.resetIds==='object')state.resetIds=cur.resetIds;else delete state.resetIds}
 stampEffectiveSaves(cur,state);
 const report={};stampPut(cur,state,{overRead:body.baseRev!=null&&body.baseRev===rev,stamped:body.stamped===true,report});state._rev=rev+(report.changed?2:1);state._wids=[...(Array.isArray(cur?._wids)?cur._wids:[]),...(cur?._wid?[cur._wid]:[])].filter(x=>typeof x==='string').slice(-50);state._wid=crypto.randomUUID();return state;
}
