import {useActiveStatus} from '../lib/active-status.js'
import { useLifestyle } from '../lib/lifestyle.js'
import { useStore } from '../store/useStore.js'
export default function Avatar({ person, size = 44 }) {
  const profile = useLifestyle(s => s.profile)
  const user = useStore(s => s.user)
  const p = person || profile
  const name = p.nickname || (!person && user?.name) || '我'
  const status=useActiveStatus(p.currentStatus)
  return <span data-status-active={!!status} className={'life-avatar'+(status?' has-live-status':'')} style={{ width:size, height:size, minWidth:size, maxWidth:size, minHeight:size, maxHeight:size, aspectRatio:'1 / 1', boxSizing:'border-box', flexShrink:0, fontSize:Math.round(size*.4) }}>
    {p.avatar ? <img src={p.avatar} alt={`${name}的头像`} /> : name.slice(0,1)}
  </span>
}
