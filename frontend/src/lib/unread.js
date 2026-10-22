import {create} from 'zustand'
import {api} from './api.js'
import {useStore} from '../store/useStore.js'
export const useUnread=create(()=>({owner:null,count:0,messages:0,interactions:0}))
let pending=null,generation=0
export function resetUnread(owner=null){generation++;pending=null;useUnread.setState({owner,count:0,messages:0,interactions:0})}
export async function refreshUnread(force=false){
 if(force===true){generation++;pending=null}
 const owner=useStore.getState().user?.id;if(!owner){resetUnread();return}
 if(useUnread.getState().owner!==owner)resetUnread(owner)
 if(pending)return pending
 const epoch=generation
 const run=api('/api/life/unread').then(d=>{if(epoch===generation&&useStore.getState().user?.id===owner)useUnread.setState({owner,count:Math.max(0,Number(d.total)||0),messages:Math.max(0,Number(d.messages)||0),interactions:Math.max(0,Number(d.interactions)||0)})}).finally(()=>{if(epoch===generation)pending=null})
 pending=run;return run
}
