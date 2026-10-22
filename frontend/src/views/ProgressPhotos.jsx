import {useOriginNavigate as useNavigate, ReturnButton, useReturn} from '../lib/route-origin.jsx'
// Every progress photo across every logged workout, in one place, newest first — a quick way to
// add one to today, and a before/after comparison between any two.
//
// WorkoutMedia.jsx already lets a photo or video be attached to a finished workout — that is
// still the only place one is stored (addWorkoutMedia, a saved workout's own `media` list) and
// where one is removed. What this view adds is a shortcut for the common case (today's workout
// is already logged) straight onto the record WorkoutMedia.jsx would have written to anyway, plus
// lining every still up chronologically and a slider to compare two dates directly. Nothing new
// to store, sync or back up — one more way to reach and to look at data the media system already
// keeps, private to the account the same way everything else there is (DATA_DIR/uploads/<uid>/,
// api/media.js).
import PhotoCompareShare from '../components/PhotoCompareShare.jsx'
import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { fmtDate, todayISO } from '../lib/format.js'
import { workoutMediaOf, WORKOUT_MEDIA_MAX } from '../lib/media-refs.js'
import { addWorkoutMedia } from '../lib/workout-media.js'
import { syncMedia } from '../lib/media-sync.js'
import { useMediaPicker } from '../components/CustomMediaField.jsx'
import { CustomThumb, MediaView, useMediaUrl } from '../components/CustomMedia.jsx'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

const toast = m => useUI.getState().toast(m)

/** Today's own logged workout, the latest one if there is more than one — where "Add photo"
 *  attaches to, same as opening that workout and using WorkoutMedia.jsx there directly. */
export function todaysWorkout(S) {
  const today = (S.workouts || []).filter(w => w.d === todayISO())
  if (!today.length) return null
  return today.reduce((a, b) => (b.start || 0) > (a.start || 0) ? b : a)
}

/**
 * Every still photo (no video — the comparison wants two stills, not two clips) across every
 * logged workout, newest first. Each entry carries the date and the workout it came from, so the
 * grid and the comparator can both say when a photo was taken without re-deriving it.
 */
export function progressPhotosOf(S) {
  const out = []
  for (const w of (S && S.workouts) || []) {
    for (const m of workoutMediaOf(w)) {
      if (m.kind === 'video') continue
      // `key`: the same file can sit on two workouts (one hash), and each is its own photo here.
      out.push({ key: (w.id || w.start || w.d) + ':' + m.hash, d: w.d, start: w.start || 0, w, m })
    }
  }
  out.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : b.start - a.start))
  return out
}

/** Runs an already-sorted progressPhotosOf() list into { d, items }[] groups of the same date. */
export function groupByDate(photos) {
  const out = []
  for (const p of photos) {
    const last = out[out.length - 1]
    if (last && last.d === p.d) last.items.push(p)
    else out.push({ d: p.d, items: [p] })
  }
  return out
}

/** Whole days between two ISO dates, always ≥ 0 regardless of which comes first. */
export function daysBetween(a, b) {
  const ms = new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')
  return Math.abs(Math.round(ms / 86400000))
}

function openPhotoView(p) {
  useUI.getState().openSheet(close => (
    <div className="mviewer" role="dialog" aria-modal="true" aria-label={t('Photo')}>
      <div className="mviewer-bar">
        <button type="button" className="iconbtn" aria-label={t('Close')} onClick={close}><Icon name="xmark" /></button>
        <span className="mviewer-count">{fmtDate(p.d, true, true)}</span>
        <span style={{ width: 36 }} />
      </div>
      <div className="mviewer-stage"><MediaView m={p.m} cls="exmedia viewer" /></div>
    </div>
  ), { kind: 'viewer' })
}

/** The before/after slider between two progress photos `a` (earlier) and `b` (later). */
const photoMark=p=>p.w?.photoNotes?.[p.m.hash]||{}
const editableMark=(p,unit)=>{const m={...photoMark(p)};if(m.weight&&m.weightUnit&&m.weightUnit!==unit)m.weight=Math.round(m.weight*(unit==='lb'?2.2046226218:1/2.2046226218)*10)/10;return {...m,weightUnit:unit}}
function PhotoLabels({photo}){const m=photoMark(photo);const unit=useStore(s=>s.S?.unit||'kg');return <p className="life-photo-label">{photo.d} · {({front:'正面',side:'侧面',back:'背面',other:'其他'})[m.angle]||'未标注角度'}{m.weight?` · ${m.weight} ${unit}`:''}{m.waist?` · 腰围 ${m.waist} cm`:''}{m.chest?` · 胸围 ${m.chest} cm`:''}{m.hip?` · 臀围 ${m.hip} cm`:''}</p>}
function ProgressCompare({ a, b, close }) {
  const before = useMediaUrl(a.m)
  const after = useMediaUrl(b.m)
  const [view,setView]=useState('slider')
  const [pct, setPct] = useState(50)
  const stageRef = useRef(null)
  const dragging = useRef(false)

  const setFromClientX = x => {
    const el = stageRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (!rect.width) return
    setPct(Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100)))
  }
  const onPointerDown = e => { dragging.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); setFromClientX(e.clientX) }
  const onPointerMove = e => { if (dragging.current) setFromClientX(e.clientX) }
  const endDrag = () => { dragging.current = false }

  const days = daysBetween(a.d, b.d)

  return <div className="mviewer" role="dialog" aria-modal="true" aria-label={t('Compare photos')}>
    <div className="mviewer-bar">
      <button type="button" className="iconbtn" aria-label={t('Close')} onClick={close}><Icon name="xmark" /></button>
      <span className="mviewer-count">{days > 0 ? tn('{0} day apart', '{0} days apart', days) : t('Same day')}</span>
      <span style={{ width: 36 }} />
    </div>
    <div className="life-photo-view-tabs"><button className="life-secondary" onClick={()=>setView(v=>v==='side'?'slider':'side')}>{view==='side'?'切换滑动对比':'切换并排对比'}</button><span className="small muted">照片与标注仅自己可见</span></div>
    {view==='side'?<div className="life-photo-side"><figure>{before.url&&<img src={before.url} alt="较早的进步照片"/>}<PhotoLabels photo={a}/></figure><figure>{after.url&&<img src={after.url} alt="较晚的进步照片"/>}<PhotoLabels photo={b}/></figure></div>:<>
    {/* A photo has no reading direction: before stays on the left and the finger drives the
        handle the same way in Arabic, so the stage is ltr like DurationWheel's wheel. */}
    <div className="pp-compare" dir="ltr" ref={stageRef} data-swipe-ignore
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
      {after.url && <img className="pp-img" src={after.url} alt="" draggable={false} />}
      {before.url && <img className="pp-img" src={before.url} alt="" draggable={false}
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }} />}
      <div className="pp-handle" style={{ insetInlineStart: pct + '%' }}><div className="pp-grip" /></div>
      <div className="pp-label pp-label-before">{fmtDate(a.d, true)}</div>
      <div className="pp-label pp-label-after">{fmtDate(b.d, true)}</div>
    </div><div className="life-photo-labels"><PhotoLabels photo={a}/><PhotoLabels photo={b}/></div></>}
    <PhotoCompareShare before={before.url} after={after.url} a={a} b={b}/>
  </div>
}

/** Opens the before/after slider between two progressPhotosOf() entries, in date order either way. */
export function openProgressCompare(x, y) {
  const [a, b] = x.d <= y.d ? [x, y] : [y, x]
  useUI.getState().openSheet(close => <ProgressCompare a={a} b={b} close={close} />, { kind: 'viewer' })
}

export default function ProgressPhotos() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const allPhotos = useMemo(() => progressPhotosOf(S), [S.workouts])
  const [angle,setAngle]=useState('all'),[from,setFrom]=useState(''),[until,setUntil]=useState(''),[annotating,setAnnotating]=useState(null),[photoError,setPhotoError]=useState('')
  const photos=allPhotos.filter(p=>(!from||p.d>=from)&&(!until||p.d<=until)&&(angle==='all'||photoMark(p).angle===angle))
  const groups = useMemo(() => groupByDate(photos), [photos])
  const [comparing, setComparing] = useState(false)
  const [picked, setPicked] = useState([])   // up to 2 photo keys, in tap order
  const today = todaysWorkout(S)
  const { pick, busy, canAdd, showAdd } = useMediaPicker()
  const fileRef = useRef(null)

  const toggle = p => setPicked(cur => {
    if (cur.includes(p.key)) return cur.filter(k => k !== p.key)
    return cur.length >= 2 ? [cur[1], p.key] : [...cur, p.key]
  })
  const cancelCompare = () => { setComparing(false); setPicked([]) }
  const runCompare = () => {
    if (picked.length !== 2) return
    const [ha, hb] = picked
    const a = photos.find(p => p.key === ha)
    const b = photos.find(p => p.key === hb)
    cancelCompare()
    if (a && b) openProgressCompare(a, b)
  }
  // Attaches straight onto today's already-logged workout — the file picker offers the camera
  // on a phone the same way WorkoutMedia.jsx's does, since it is the very same input.
  const onFile = async ev => {
    const file = ev.target.files && ev.target.files[0]
    ev.target.value = ''
    if (!file || !today) return
    if (workoutMediaOf(today).length >= WORKOUT_MEDIA_MAX) { toast(t('Up to {0} photos or videos per workout.', WORKOUT_MEDIA_MAX)); return }
    const got = await pick(file)
    if (!got) return
    let res
    update(s => { res = addWorkoutMedia(s, today, got) })
    if (res === 'added') { toast(t('Photo added')); syncMedia({ force: true }) }
    else if (res === 'full') toast(t('Up to {0} photos or videos per workout.', WORKOUT_MEDIA_MAX))
    else if (res === 'gone') toast(t('Workout deleted'))
  }

  return <>
    <div className="hdr"><ReturnButton fallback="/stats"/>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Progress photos')}</h1>
        <div className="sub">{tn('{0} photo', '{0} photos', photos.length)}</div></div>
      {photos.length >= 2 && (comparing
        ? <Button size="sm" variant="ghost" onClick={cancelCompare}>{t('Cancel')}</Button>
        : <Button size="sm" variant="tinted" onClick={() => setComparing(true)}>{t('Compare')}</Button>)}
    </div>

    <section className="card life-form"><p className="small muted">进度照片、体重和围度标注默认私人可见；此页面不会自动发布到社区。</p><div className="life-form-row"><label>开始日期<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setPicked([])}}/></label><label>结束日期<input type="date" value={until} onChange={e=>{setUntil(e.target.value);setPicked([])}}/></label></div><label>照片角度<select value={angle} onChange={e=>{setAngle(e.target.value);setPicked([])}}>{Object.entries({all:'全部角度',front:'正面',side:'侧面',back:'背面',other:'其他'}).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label><p className="small muted">建议选择同角度、相近光线的两张照片进行比较。</p><button className="life-link" disabled={!photos.length} onClick={()=>setAnnotating({key:photos[0].key,...editableMark(photos[0],S.unit)})}>标注照片的角度 / 体重 / 围度</button></section>
    {annotating&&<section className="card life-form" aria-label="照片标注"><label>选择照片<select value={annotating.key} onChange={e=>{const p=photos.find(p=>p.key===e.target.value);setAnnotating({key:p.key,...editableMark(p,S.unit)})}}>{photos.map((p,i)=><option value={p.key} key={p.key}>{p.d} · 照片 {i+1}</option>)}</select></label><label>角度<select value={annotating.angle||'other'} onChange={e=>setAnnotating(x=>({...x,angle:e.target.value}))}>{Object.entries({front:'正面',side:'侧面',back:'背面',other:'其他'}).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label><div className="life-form-row">{[['weight','体重 '+S.unit],['waist','腰围 cm'],['chest','胸围 cm'],['hip','臀围 cm']].map(([k,n])=><label key={k}>{n}<input type="number" min="0" max={k==='weight'?1000:500} step="any" value={annotating[k]??''} onChange={e=>setAnnotating(x=>({...x,[k]:e.target.value}))}/></label>)}</div><button className="life-primary" onClick={()=>{const p=photos.find(p=>p.key===annotating.key);if(!p)return;setPhotoError('');for(const k of ['weight','waist','chest','hip']){const v=Number(annotating[k]);if(annotating[k]&&(!Number.isFinite(v)||v<=0||v>(k==='weight'?1000:500))){setPhotoError('请填写有效的体重和围度；未保存任何标注。');return}}const mark={angle:annotating.angle||'other',weightUnit:S.unit};for(const k of ['weight','waist','chest','hip']){const v=Number(annotating[k]);if(annotating[k]&&!(!Number.isFinite(v)||v<0||v>(k==='weight'?1000:500)))mark[k]=v}update(s=>{const w=s.workouts.find(w=>w.id?p.w.id===w.id:w.start===p.w.start&&w.d===p.w.d);if(w)w.photoNotes={...w.photoNotes,[p.m.hash]:mark}});setAnnotating(null)}}>保存私人标注</button>{photoError&&<p className="life-error" role="alert">{photoError}</p>}<button className="life-link" onClick={()=>setAnnotating(null)}>取消</button></section>}
    {!comparing && showAdd && <div className="row" style={{ marginBottom: 16 }}>
      {today
        ? <Button icon={busy ? 'image' : 'camera'} disabled={!canAdd} onClick={() => fileRef.current?.click()}>
            {busy ? t('Loading…') : t('Add a photo to today')}
          </Button>
        : <Button icon="dumbbell" onClick={() => nav('/workout')}>{t('Log today’s workout to add a photo')}</Button>}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
    </div>}

    {comparing && <div className="small dim" style={{ margin: '0 0 12px' }}>
      {picked.length < 2 ? t('Pick two photos to compare.') : t('Ready! Open the comparison.')}
    </div>}

    {!photos.length
      ? <div className="empty"><div className="ico"><Icon name="image" /></div>
          {t('No progress photos yet. The button above adds one to today, once today has a logged workout.')}
        </div>
      : groups.map(g => (
        <div key={g.d} style={{ marginBottom: 18 }}>
          <div className="small muted" style={{ marginBottom: 6 }}>{fmtDate(g.d, true, true)}</div>
          <div className="wmedia-grid">
            {g.items.map(p => {
              const selected = picked.includes(p.key)
              return (
                <button key={p.key} type="button" data-swipe-ignore
                  className={'wmedia-item' + (selected ? ' pp-selected' : '')}
                  aria-label={fmtDate(p.d, true)}
                  onClick={() => (comparing ? toggle(p) : openPhotoView(p))}>
                  <CustomThumb ex={{ custom: true, media: p.m }} />
                  {selected && <span className="pp-check"><Icon name="check" /></span>}
                </button>
              )
            })}
          </div>
        </div>
      ))}

    {comparing && picked.length === 2 && <div className="pp-cta">
      <Button variant="primary" onClick={runCompare}>{t('Compare')}</Button>
    </div>}
  </>
}
