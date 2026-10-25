import CommunityInvite from './CommunityInvite.jsx'
import {useState,useEffect,useRef} from 'react'
import {useStore} from '../store/useStore.js'
import {useOriginNavigate} from '../lib/route-origin.jsx'
const steps=[['欢迎加入 OpenGym','openGym是小林为自己和朋友制作的健身记录站。希望训练、认真吃饭和朋友的鼓励，都能在这里留下痕迹。你可以按自己的节奏使用，不用和任何人比较。',null],['先认识自己','在“我的”补充目标、性格、身高与体重。身体数据默认私密，也可以逐项选择是否展示给伙伴。','/me'],['把计划变成行动','在“计划”手动安排训练，或请AI根据时间、器材和训练经验起草，再修改、一键应用。训练中可直接查看动作演示。','/plan'],['好好吃饭，也记录生活','“饮食”支持拍照估算、常吃餐和趋势；“社区”可以发布照片视频、评论鼓励朋友，互关后聊天。AI估算与建议都可以修改。','/nutrition'],['你始终可以自己决定','自己的称重和饮食默认不公开。身体照片只有在你确认后才临时发送给AI服务，不进入社区；备份和教程入口都在“我的→设置与数据”。','/me/settings']]
export default function WelcomeGuide({manual=false,onClose}){
 const nav=useOriginNavigate(),user=useStore(s=>s.user),S=useStore(s=>s.S),[index,setIndex]=useState(0),[later,setLater]=useState(false)
 const dialog=useRef(null)
 const visible=!!user&&!later&&(manual||!(S.welcomeVersion>=1))
 useEffect(()=>{if(!visible)return;const previous=document.activeElement;dialog.current?.focus();const key=e=>{if(e.key==='Escape'){e.preventDefault();finish()}if(e.key==='Tab'){const els=[...dialog.current.querySelectorAll('a[href],button:not([disabled])')];const first=els[0],last=els.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){e.preventDefault();first?.focus()}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus?.()}},[visible,user?.id])
 useEffect(()=>{setIndex(0);setLater(false)},[user?.id])
 if(!user||later||(!manual&&S.welcomeVersion>=1))return null
 const finish=()=>{useStore.getState().update(st=>{st.welcomeVersion=Math.max(1,st.welcomeVersion||0)});setLater(true);onClose?.()}
 const [title,text,path]=steps[index]
 return <div className="life-modal-backdrop welcome-backdrop"><section ref={dialog} tabIndex={-1} className="life-modal welcome-guide" role="dialog" aria-modal="true" aria-label="欢迎使用openGym"><div className="welcome-content"><span className="welcome-kicker">openGym · {index===0?'欢迎来到这里':'新手引导 '+index+' / 4'}</span><h2>{title}</h2><p>{text}</p>{index===0&&<CommunityInvite compact/>}</div><footer className="welcome-footer"><div className="welcome-dots">{steps.map((_,i)=><span key={i} className={index===i?'active':''}/>)}</div>{path&&<button className="life-secondary" onClick={()=>{finish();nav(path)}}>现在去看看</button>}<div className="life-actions">{index>0&&<button className="life-secondary" onClick={()=>setIndex(i=>i-1)}>上一步</button>}<button className="life-primary" onClick={()=>index===4?finish():setIndex(i=>i+1)}>{index===0?'了解本站功能':index===4?'开始我的健身记录':'继续'}</button></div><button className="life-link" onClick={finish}>我已了解，稍后自己探索</button></footer></section></div>
}
