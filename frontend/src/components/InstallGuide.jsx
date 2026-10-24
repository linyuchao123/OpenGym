import {useEffect,useState} from 'react'
export default function InstallGuide(){
 const [prompt,setPrompt]=useState(null),[message,setMessage]=useState('')
 useEffect(()=>{const handle=e=>{e.preventDefault();setPrompt(e)},installed=()=>{setPrompt(null);setMessage('已添加到主屏幕。')};window.addEventListener('beforeinstallprompt',handle);window.addEventListener('appinstalled',installed);return()=>{window.removeEventListener('beforeinstallprompt',handle);window.removeEventListener('appinstalled',installed)}},[])
 return <details className="card"><summary>添加到手机主屏幕</summary><p>iPhone：用 Safari 打开本站，点“分享”→“添加到主屏幕”。安卓：用 Chrome 或支持安装的系统浏览器，打开菜单选择“安装应用”或“添加到主屏幕”。微信内可从右上角菜单选择外部浏览器打开。</p>{prompt&&<button className="life-secondary" onClick={async()=>{await prompt.prompt();const r=await prompt.userChoice;setMessage(r.outcome==='accepted'?'正在安装…':'已取消，可稍后安装。');setPrompt(null)}}>安装 OpenGym</button>}<p>训练草稿与待同步饮食保留在当前设备。首次打开、登录、社区与上传需要网络；恢复联网后请检查“数据保存状态”。浏览器清理数据会影响尚未同步的内容，请及时备份。</p><p role="status">{message}</p></details>
}
