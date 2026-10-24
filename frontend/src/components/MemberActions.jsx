import {ReportButton} from './CommunitySafety.jsx'
import { useState } from 'react'
import {useOriginNavigate as useNavigate} from '../lib/route-origin.jsx'
import { api } from '../lib/api.js'
import { useStore } from '../store/useStore.js'
export default function MemberActions({person,onChange}) {
  const me=useStore(s=>s.user);const nav=useNavigate();const [busy,setBusy]=useState(false);const [error,setError]=useState('')
  if(!me || me.id===person.id)return null
  const act=async(route,body)=>{setBusy(true);setError('');try{await api('/api/life/'+route,{method:'POST',body:JSON.stringify({id:person.id,...body})});onChange?.()}catch(e){setError(e.message)}finally{setBusy(false)}}
  return <div className="life-member-actions"><button className="life-secondary" disabled={busy} aria-pressed={!!person.following} onClick={()=>act('follow',{following:!person.following})}>{person.following?'已关注':person.followsYou?'回关':'关注'}</button><button className="life-link" onClick={()=>nav('/messages?with='+encodeURIComponent(person.id))}>私聊</button><ReportButton kind="user" id={person.id}/>{error&&<span className="life-error" role="alert">{error}</span>}</div>
}
