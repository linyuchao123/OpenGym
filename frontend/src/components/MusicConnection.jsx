import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'
export default function MusicConnection(){
 const [status,setStatus]=useState(null),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{let alive=true;api('/api/life/music/connection').then(d=>{if(alive)setStatus(d)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[])
 const test=async()=>{setBusy(true);setError('');try{setResult(await api('/api/life/music/connection/test',{method:'POST',body:'{}',timeout:30000}))}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <section className="card life-form"><h2>抖音 / 汽水音乐接入</h2><p className="small muted">验证应用凭证与推荐权限，不会上传用户作品、同步收藏或购买服务。</p>{status&&<><p>应用凭证：{status.configured?'已配置':'尚未配置'} · 本站配乐授权：{status.rightsConfirmed?'已由管理员确认':'尚待确认'}</p><p className="small muted">需在服务端配置 DOUYIN_CLIENT_KEY、DOUYIN_CLIENT_SECRET；不要把密钥填入简介或聊天。接口验证成功也不代表全部歌曲可用于本站配乐。</p><button className="life-primary" disabled={busy} onClick={test}>{busy?'正在验证官方接口…':'验证接入状态'}</button></>}{result&&<p className="life-notice" role="status">{result.message}{result.code!==null&&result.code!==undefined?'（返回码 '+result.code+'）':''}</p>}{error&&<p className="life-error" role="alert">{error}</p>}<a href="https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/qishui-music/feed-song-tab" target="_blank" rel="noreferrer">查看官方权限文档</a></section>
}
