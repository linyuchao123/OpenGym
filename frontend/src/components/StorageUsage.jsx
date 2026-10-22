import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'
import {useStore} from '../store/useStore.js'
const format=n=>n>=1073741824?(n/1073741824).toFixed(2)+' GB':(n/1048576).toFixed(1)+' MB'
export default function StorageUsage({compact=false,refreshKey=0}){
 const enabled=useStore(s=>s.config?.communityMedia?.multipart),owner=useStore(s=>s.user?.id)
 const [result,setUsage]=useState(null),[error,setError]=useState(''),[version,setVersion]=useState(0),[busy,setBusy]=useState('')
 useEffect(()=>{setUsage(null);if(!enabled||!owner)return;let active=true;api('/api/uploads/usage').then(u=>{if(active){setUsage({...u,owner});setError('')}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[enabled,owner,refreshKey,version])
 const usage=result?.owner===owner?result:null
 if(!enabled)return null
 const clear=async id=>{const current=owner;setBusy(id);try{await api('/api/uploads/'+id,{method:'DELETE'});if(useStore.getState().user?.id===current)setVersion(v=>v+1)}catch(e){if(useStore.getState().user?.id===current)setError(e.message)}finally{setBusy('')}}
 return <section className={'storage-usage '+(compact?'compact':'card')} aria-label="素材空间"><strong>我的素材空间</strong>{usage?<><p>{format(usage.bytes)} / {format(usage.quotaBytes)}{usage.reservedBytes>0&&`（含待上传 ${format(usage.reservedBytes)}）`}</p><progress value={usage.bytes} max={usage.quotaBytes}/>{!compact&&<><p className="small muted">本站已使用 {format(usage.siteBytes)} / {format(usage.siteQuotaBytes)}。视频最多200 MB，照片最多20 MB；照片会优化尺寸以节省空间。未完成上传保留24小时，可重新选择原文件续传。</p>{usage.pending.map(item=><div className="pending-upload" key={item.id}><span>{item.name} · {format(item.size)}</span><button className="life-link" disabled={!!busy||item.status==='finalizing'} onClick={()=>clear(item.id)}>清理未完成上传</button></div>)}</>}</>:<p className="small muted">{error||'正在读取容量…'}</p>}{usage&&error&&<p className="life-error">{error}</p>}</section>
}
