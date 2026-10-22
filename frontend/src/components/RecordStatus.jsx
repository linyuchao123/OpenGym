import {useNavigate} from 'react-router-dom'
import {useStore} from '../store/useStore.js'
import {useLifestyle} from '../lib/lifestyle.js'
export default function RecordStatus(){const nav=useNavigate(),sync=useStore(s=>s.sync),user=useStore(s=>s.user),life=useLifestyle();const workout=({ok:'训练已同步到服务器',local:'训练保存在本机',pending:'训练保存在本机，等待同步',offline:'训练保存在本机，当前离线',auth:'训练同步需重新登录',error:'训练同步失败，保留本机记录',held:'训练等待确认合并'})[sync?.status]||'正在检查训练保存状态';return <div className="life-record-status" role="status"><span>{workout}</span><span>{life.syncingMeals?'饮食正在同步…':life.pendingMeals?.length?`饮食本机已保存，${life.pendingMeals.length} 条等待同步`:user?'饮食确认保存后写入服务器':'饮食保存在本机'}</span><button className="life-link" onClick={()=>nav('/data-status')}>详情 / 重试 / 备份</button></div>}
