import { useNavigate } from 'react-router-dom'
import { useLifestyle } from '../lib/lifestyle.js'
import { homeHighlights } from '../lib/home-highlights.js'
import { streakWeeks } from '../lib/history.js'
import { todayISO,fmtNum } from '../lib/format.js'
import { EXIDX } from '../lib/exercises.js'
import { exerciseNameFor } from '../lib/i18n.js'
import Icon from './Icon.jsx'

export function TodayOverview({S,onWeight}) {
  const nav=useNavigate();const {meals,loading,error}=useLifestyle()
  const h=homeHighlights(S,meals,todayISO())
  const available=!loading&&!error
  return <section className="card home-overview" aria-label="今日概览"><div className="home-section-title"><h2>今日概览</h2><span>每一份记录，都算进步</span></div><div className={'home-overview-grid'+(S.showWeightCard===false?' two':'')}>
    <button onClick={()=>nav('/workout')} aria-label="查看今日训练"><span><Icon name="dumbbell"/>训练</span><strong>{h.todayWorkouts}<small> 次</small></strong><em>{S.active?.editingWorkoutId?'继续编辑 →':S.active?'继续训练 →':'记录训练 →'}</em></button>
    <button onClick={()=>nav('/nutrition')} aria-label="查看今日饮食"><span><Icon name="utensils"/>已记录热量</span><strong>{available&&h.todayMeals?fmtNum(h.calories):'—'}<small> kcal</small></strong><em>{loading?'正在加载':error?'加载失败，点击重试':h.todayMeals?`${h.todayMeals} 餐 · 继续记录 →`:'还未记录 →'}</em></button>
    {S.showWeightCard!==false&&<button onClick={onWeight} aria-label="快速记录今日体重"><span><Icon name="scale"/>今日体重</span><strong>{h.todayWeight?fmtNum(h.todayWeight.w):'—'}<small> {S.unit}</small></strong><em>{h.todayWeight?'再记一次 →':'记录体重 →'}</em></button>}
  </div></section>
}
export function WeeklyProgress({done,planned,onDetails,onPlan}) {
  const progress=planned?Math.min(done,planned)/planned*100:0
  return <section className="card home-week-progress"><div className="home-section-title"><h2>本周进度</h2><button className="life-link" onClick={onDetails}>查看周报 →</button></div><div className="home-week-numbers"><strong>{done}<small> 已记录</small></strong><span>{planned?`当前计划 ${planned} 次`:'按自己的节奏，慢慢积累'}</span></div>{planned>0&&<progress aria-label="训练记录与当前计划次数对照" value={progress} max="100"/>}<p className="small muted">{planned?done>=planned?'本周记录次数已达到计划参考，记得留出休息时间。':'额外训练也计入记录，具体安排以日历和计划为准。':done?'已经留下训练记录，也可以安排一个适合自己的计划。':'还没有每周计划，先从一次训练开始。'}</p>{!planned&&<button className="life-link" onClick={onPlan}>安排训练计划 →</button>}</section>
}
export function Milestones({S,onRecord,onHistory}) {
  const h=homeHighlights(S,[],todayISO());const record=h.latestRecord
  const name=record?(EXIDX[record.exercise]?exerciseNameFor(EXIDX[record.exercise]):record.workout.entries?.find(e=>e.id===record.exercise)?.n || '自定义动作'):''
  return <section className="card home-milestones"><div className="home-section-title"><h2><Icon name="trophy"/>进步里程碑</h2><button className="life-link" onClick={onHistory}>训练历史 →</button></div><div className="home-milestone-count"><strong>{h.totalWorkouts}<small> 次累计训练</small></strong><span>{h.trainingDays} 个训练日 · 连续 {streakWeeks(S)} 周</span></div><p className="small muted">{h.achieved?`已达成 ${h.achieved} 次训练里程碑`:'第一份训练记录，就是起点'}{h.next?` · 距 ${h.next} 次还差 ${h.next-h.totalWorkouts} 次`:''}</p>{record?<button className="home-latest-record" onClick={()=>onRecord(record.workout)}><Icon name="trophy"/><span><small>最近的个人纪录 · {record.date}</small><strong>{name}</strong></span><Icon name="chevronRight"/></button>:<div className="home-milestone-empty">认真完成动作、留下记录，进步会慢慢看得见。</div>}</section>
}
