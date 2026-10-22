import {useEffect,useRef} from 'react'
// No overlapping requests; hidden tabs sleep and failed requests back off to one minute.
export function useVisiblePoll(load,interval,deps=[]){
 const latest=useRef(load);latest.current=load
 useEffect(()=>{let alive=true,running=false,timer,failures=0
  const tick=async()=>{clearTimeout(timer);if(!alive||running||document.hidden)return;running=true;try{await latest.current(()=>alive);failures=0}catch{failures++}finally{running=false;if(alive&&!document.hidden)timer=setTimeout(tick,Math.min(60000,interval*2**failures))}}
  const resume=()=>{clearTimeout(timer);if(!document.hidden)tick()};tick();document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume)
  return()=>{alive=false;clearTimeout(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume)}
 },[interval,...deps])
}
