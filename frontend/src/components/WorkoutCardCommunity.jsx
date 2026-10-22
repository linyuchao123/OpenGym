import { useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { uploadLifestyle } from '../lib/lifestyle.js'
import { sameWorkout } from '../lib/workout-date.js'

export default function WorkoutCardCommunity({ blob, workout, onPublished }) {
  const user = useStore(s => s.user)
  const owner = useRef(user?.id)
  const [confirming, setConfirming] = useState(false)
  const [text, setText] = useState(`完成训练：${workout.name || '我的训练'} 💪`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const check = () => {
    const current = useStore.getState()
    if (!owner.current || current.user?.id !== owner.current) throw new Error('账号已变化，请重新打开打卡卡片。')
    if (!current.S.workouts.some(w => sameWorkout(w, workout))) throw new Error('训练记录已变化，请重新打开打卡卡片。')
  }
  const publish = async () => {
    if (busy || !blob) return
    setBusy(true); setError('')
    try {
      check()
      const media = await uploadLifestyle(blob)
      check()
      const result = await api('/api/life/post', { method: 'POST', body: JSON.stringify({ category:'workout',text: text.trim(), media: [media.id] }) })
      onPublished(result.post?.id)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  return <div style={{ marginTop: 12, textAlign: 'start' }}>
    {!confirming ? <button className="life-primary" disabled={!user || !blob} onClick={() => setConfirming(true)}>发布打卡到好友社区</button> : <div className="card">
      <h4>确认发布打卡</h4>
      <p className="small muted">社区成员将看到上方卡片和下方文案，动态也会显示在「我的」。卡片含训练名称、日期和训练统计，请先检查。</p>
      <label>打卡文案<textarea className="life-input" aria-label="打卡文案" maxLength={2000} rows={3} value={text} disabled={busy} onChange={e => setText(e.target.value)} /></label>
      <div className="life-actions"><button className="life-primary" disabled={busy || !blob} onClick={publish}>{busy ? '正在发布…' : '确认发布给好友'}</button>
      <button className="life-link" disabled={busy} onClick={() => setConfirming(false)}>取消发布</button></div>
    </div>}
    {!user && <p className="small muted">登录后可发布到好友社区，也可以先保存卡片。</p>}
    {error && <p className="life-error" role="alert">{error}</p>}
  </div>
}
