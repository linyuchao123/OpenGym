import {useCallback,useEffect,useRef} from 'react'
import {useLocation,useNavigate} from 'react-router-dom'
import Icon from '../components/Icon.jsx'
export function useOriginNavigate(){
 const nav=useNavigate(),loc=useLocation()
 return useCallback((to,opts={})=>{if(typeof to==='number')return nav(to);if(to===loc.pathname+loc.search)return;nav(to,{...opts,...(globalThis.history?.state?.openGymLifeModal?{replace:true}:{}),state:{...opts.state,returnTo:loc.pathname+loc.search,returnKey:loc.key,rootTab:loc.state?.rootTab||(loc.pathname.startsWith('/me')?'me':['community','member','members','messages','notifications','challenges'].includes(loc.pathname.split('/')[1])?'community':loc.pathname==='/nutrition'?'nutrition':'home')}})},[nav,loc.pathname,loc.search,loc.key])
}
export function useReturn(fallback='/me'){
 const nav=useNavigate(),loc=useLocation()
 return ()=>{if(loc.state?.returnTo && (globalThis.history?.state?.idx||0)>0)nav(-1);else nav(loc.state?.returnTo||fallback,{replace:true})}
}
export function ReturnButton({fallback='/me',label='返回'}){const back=useReturn(fallback);return <button className="life-icon" aria-label={label} onClick={back}><Icon name="chevronLeft"/></button>}

// Defer removal by one task: React StrictMode replays mount effects, and opening
// the next sheet immediately should reuse the closing entry rather than leave a blank one.
let closingSheet=null
export function useModalHistory(open,close,blocked=false){
 const latest=useRef(close),locked=useRef(blocked);latest.current=close;locked.current=blocked
 useEffect(()=>{if(!open)return;const token=crypto.randomUUID(),before=window.history.state||{}
  if(closingSheet&&before.openGymLifeModal===closingSheet.token){clearTimeout(closingSheet.timer);closingSheet=null;window.history.replaceState({...before,openGymLifeModal:token},'',window.location.href)}
  else window.history.pushState({...before,idx:(before.idx||0)+1,openGymLifeModal:token},'',window.location.href)
  const pop=()=>{if(window.history.state?.openGymLifeModal!==token){if(locked.current){const current=window.history.state||{};window.history.pushState({...current,idx:(current.idx||0)+1,openGymLifeModal:token},'',window.location.href)}else latest.current()}}
  const key=e=>{if(e.key==='Escape')window.history.back()};window.addEventListener('popstate',pop);document.addEventListener('keydown',key)
  return()=>{window.removeEventListener('popstate',pop);document.removeEventListener('keydown',key);if(window.history.state?.openGymLifeModal===token){const timer=setTimeout(()=>{if(window.history.state?.openGymLifeModal===token)window.history.back();if(closingSheet?.token===token)closingSheet=null},0);closingSheet={token,timer}}}
 },[!!open])
}
