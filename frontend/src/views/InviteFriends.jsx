import {useOriginNavigate as useNavigate, ReturnButton, useReturn} from '../lib/route-origin.jsx'
import {useState} from 'react'
import {useStore} from '../store/useStore.js'
import {api} from '../lib/api.js'
import QrCanvas from '../components/QrCanvas.jsx'
import {useLifeQuery} from './LifeHub.jsx'
export function invitationCode(){const hash=new URLSearchParams(location.hash.split('?')[1]||'');const code=new URLSearchParams(location.search).get('invite')||hash.get('invite')||'';return /^[A-Za-z0-9-]{1,40}$/.test(code)?code:''}
export default function InviteFriends(){
 const user=useStore(s=>s.user),nav=useNavigate(),[invite,setInvite]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const generate=async()=>{setBusy(true);try{const d=await api('/api/admin/invites/new',{method:'POST',body:JSON.stringify({note:'好友邀请入口'})});setInvite(d.invite);setError('')}catch(e){setError(e.message)}finally{setBusy(false)}}
 const url=invite?location.origin+location.pathname+'?invite='+encodeURIComponent(invite.code)+'#/home':''
 const share=async()=>{try{if(navigator.share)await navigator.share({title:'一起记录健身生活',text:'这是本站邀请（名额以管理员设置为准），请仅交给准备加入的朋友。',url});else{await navigator.clipboard.writeText(url);setNotice('邀请链接已复制。')}}catch(e){if(e.name!=='AbortError')setError('无法打开分享面板，请手动复制链接。')}}
 return <div className="narrow life-page"><header className="hdr"><h1>邀请朋友</h1><ReturnButton/></header><p className="life-notice">加入链接仅用于本站，每个邀请码的注册名额由管理员设置。请私下交给准备加入的朋友，勿公开发布。</p>{user?.admin?<><button className="life-primary" disabled={busy} onClick={generate}>{busy?'生成中…':'生成新的邀请链接'}</button>{invite&&<section className="card life-invite-result"><QrCanvas value={url}/><label>邀请链接<input className="life-input" readOnly value={url} aria-label="好友邀请链接"/></label><p>邀请码：{invite.code}</p><p className="small muted">已使用 {invite.usedCount||0} / {invite.maxUses||10}，剩余 {invite.remaining??10} 个名额</p><button className="life-secondary" onClick={share}>分享 / 复制邀请</button><p className="small muted">已有邀请码仍可在管理员页面查看或撤销。此处生成新链接不会自动发给任何人。</p></section>}</>:<p className="card">当前由站点管理员发放邀请码，请联系管理员生成后转交给朋友。</p>}{error&&<p className="life-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}</div>
}
export function WelcomeFriend(){const nav=useNavigate();const {data}=useLifeQuery('/api/inviter');return data?.inviterId?<section className="card"><h2>欢迎加入，一起开始记录</h2><p>先完善自己的资料，再认识邀请你的伙伴。关注需要由你主动确认。</p><div className="life-actions"><button className="life-secondary" onClick={()=>nav('/member?id='+encodeURIComponent(data.inviterId))}>看看邀请人的主页</button></div></section>:null}
