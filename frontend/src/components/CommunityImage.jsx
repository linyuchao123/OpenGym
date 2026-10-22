import {useEffect,useRef,useState} from 'react'
import {assetURL} from '../lib/lifestyle.js'
import {cachedImage,loadCommunityImage,onCommunityClear} from '../lib/community-cache.js'
export default function CommunityImage({id,priority=false,alt='健身日常照片'}){
 const ref=useRef(null),[src,setSrc]=useState(()=>cachedImage(id)),[error,setError]=useState(false),[retry,setRetry]=useState(0)
 useEffect(()=>{let alive=true,observer;setError(false);setSrc(cachedImage(id));const load=()=>loadCommunityImage(id,assetURL(id),priority).then(url=>{if(alive)setSrc(url)}).catch(()=>{if(alive)setError(true)});
  if(priority)load();else{observer=new IntersectionObserver(rows=>{if(rows.some(r=>r.isIntersecting)){load();observer.disconnect()}},{rootMargin:'200px'});if(ref.current)observer.observe(ref.current)}
  const stop=onCommunityClear(()=>{if(alive){setSrc(null);setRetry(v=>v+1)}});return()=>{alive=false;observer?.disconnect();stop()}
 },[id,priority,retry])
 return <div ref={ref} className={'community-image'+(!src?' pending':'')} aria-busy={!src&&!error}>{src?<img src={src} alt={alt} decoding="async" fetchPriority={priority?'high':'auto'}/>:error?<button onClick={()=>setRetry(v=>v+1)}>图片加载失败，点此重试</button>:<span className="media-loading" role="status">正在加载图片…</span>}</div>
}
