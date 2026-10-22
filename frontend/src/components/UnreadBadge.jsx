import {useUnread} from '../lib/unread.js'
import {useStore} from '../store/useStore.js'
export default function UnreadBadge(){const owner=useStore(s=>s.user?.id),state=useUnread();const count=state.owner===owner?state.count:0;return count>0?<span className="unread-badge" aria-label={count+'条未读消息'}>{count>99?'99+':count}</span>:null}
