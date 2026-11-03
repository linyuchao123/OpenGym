import {useEffect,useState} from 'react'
// Re-evaluate at expiry and on wake; background timer throttling must not leave a stale ring.
export function useActiveStatus(status){
 const [now,setNow]=useState(Date.now),expires=Number(status?.expiresAt)||0
 useEffect(()=>{const refresh=()=>setNow(Date.now());refresh();const timer=expires>Date.now()?setTimeout(refresh,Math.min(2147483647,expires-Date.now()+1)):null;window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{clearTimeout(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}},[expires])
 return expires>now?status:null
}
