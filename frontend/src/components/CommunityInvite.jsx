import {useState,useEffect} from 'react'
import {communityQRActive} from '../lib/author.js'
export default function CommunityInvite({compact=false}) {
 const [now,setNow]=useState(()=>new Date())
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer)},[])
 const active=communityQRActive(now)
 return <section className={'author-community '+(compact?'compact':'')}>
  <h2>OpenGym · 共建者社区</h2>
  <p>一起聊训练、分享使用心得。发现 Bug、希望改进的体验、期待的新功能，都欢迎告诉我。</p>
  {active ? <><a href="/author/community.jpg" target="_blank" rel="noopener noreferrer" aria-label="打开完整共建群二维码"><img className="community-qr" src="/author/community.jpg" alt="OpenGym 共建者社区微信群邀请二维码"/></a><p className="small muted">群二维码有效至 2026 年 11 月 1 日前。点击图片放大，可长按保存后在微信识别。</p></> : <p>这张群二维码已到期，请通过作者微信联系我，备注“OpenGym 入群”。</p>}
  <a className="life-link" href="/author/wechat.jpeg" target="_blank" rel="noopener noreferrer">备用入口：添加作者微信，备注 OpenGym</a>
 </section>
}
