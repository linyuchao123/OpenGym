import {useNavigate} from 'react-router-dom'
import {useStore} from '../store/useStore.js'
import {useLifestyle} from '../lib/lifestyle.js'
export default function RecordStatus(){
 const nav=useNavigate(),sync=useStore(s=>s.sync),user=useStore(s=>s.user),life=useLifestyle();
 const workout=({ok:'训练：已同步',local:'训练：本机暂存',pending:'训练：同步中',offline:'训练：本机暂存（离线）',auth:'训练：同步失败，请重新登录',error:'训练：同步失败，输入仍保留在本机',held:'训练：本机暂存，等待确认合并'})[sync?.status]||'正在检查训练保存状态';
 const meals=life.syncingMeals?'饮食：同步中':life.error&&life.pendingMeals?.length?'饮食：同步失败，输入仍保留在本机':life.pendingMeals?.length?`饮食：本机暂存，${life.pendingMeals.length} 条等待同步`:!user?'饮食：本机暂存':life.meals?.length?'饮食：已同步':'饮食：尚未记录';
 return <div className="life-record-status" role="status"><span>{workout}</span><span>{meals}</span><button className="life-link" onClick={()=>nav('/data-status')}>详情 / 重试 / 备份</button></div>
}
