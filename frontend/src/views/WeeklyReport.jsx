import {useOriginNavigate as useNavigate, ReturnButton, useReturn} from '../lib/route-origin.jsx'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useLifestyle } from '../lib/lifestyle.js'
import { isoDate } from '../lib/nutrition.js'
import { reportText,shiftReportWeek,weeklyReport } from '../lib/weekly-report.js'
import {EXIDX} from '../lib/exercises.js'
import {exerciseNameFor} from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
const signed=n=>(n>0?'+':'')+n
export default function WeeklyReport(){
  const nav=useNavigate();const [query]=useSearchParams();const input=query.get('date')
  const [date,setDate]=useState(/^\d{4}-\d{2}-\d{2}$/.test(input||'')&&!Number.isNaN(Date.parse(input))?input:isoDate(new Date()))
  const S=useStore(s=>s.S);const {meals,loading,error}=useLifestyle()
  const r=weeklyReport(S,meals,date)
  r.recordNames=r.recordIds.map(id=>EXIDX[id]?exerciseNameFor(EXIDX[id]):'自定义动作')
  const [notice,setNotice]=useState('')
  const save=()=>{const blob=new Blob([reportText(r)],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`私人周报-${r.start}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('已发起周报文件保存；在 iPhone 上可保存到“文件”。')}
  return <div className="narrow life-page">
    <header className="hdr"><ReturnButton fallback="/home"/><div style={{flex:1,marginLeft:12}}><h1>我的周报</h1><div className="sub">训练、饮食与体重，一起回顾</div></div></header>
    <div className="life-report-week"><button className="life-icon" aria-label="上一周周报" onClick={()=>setDate(d=>shiftReportWeek(d,-1))}><Icon name="chevronLeft"/></button><div><strong>{r.start} — {r.last}</strong><button className="life-link" onClick={()=>setDate(isoDate(new Date()))}>回到本周</button></div><button className="life-icon" aria-label="下一周周报" onClick={()=>setDate(d=>shiftReportWeek(d,1))}><Icon name="chevronRight"/></button></div>
    {error&&<p className="life-error" role="alert">饮食资料暂未加载成功，以下饮食统计不完整：{error}</p>}
    <section className="card"><h2>这一周值得记住</h2><p>{r.trainingNames.length?`记录了 ${r.trainingNames.join('、')}，分布在 ${r.trainingDays} 个训练日。`:'本周还没有训练记录，先留下第一份记录。'}</p><p>{r.recordNames.length?`出现新纪录的动作：${r.recordNames.join('、')}。`:'本周没有新标记的个人纪录；稳定完成训练也值得记录。'}</p>{!loading&&!error&&<p>饮食记录覆盖 {r.foodDays}/7 天，共 {r.meals} 餐。{r.foodDays<7?'覆盖不足整周，暂不据此判断饮食趋势。':'记录天数齐全，但仍请检查是否漏了餐次。'}</p>}<p className="small muted">仅回顾已记录的事实，不根据训练或饮食记录推断体型变化的原因。</p></section>
    <section className="card"><div className="life-section-head"><h2>这一周的训练</h2><Icon name="dumbbell"/></div><div className="life-report-grid">{[['训练记录',r.workouts,'次'],['覆盖训练日',r.trainingDays,'天'],['已记录时长',r.minutes,'分钟'],['完成工作组',r.sets,'组']].map(([label,value,unit])=><div key={label}><span>{label}</span><strong>{value}<small> {unit}</small></strong></div>)}</div><p className="small muted">训练容量 {r.volume} {r.unit}·次 · 已标记个人纪录 {r.prs} 项</p>{r.missingDuration>0&&<p className="life-notice">{r.missingDuration} 次训练缺少时长，时长汇总仅包含已有记录。</p>}<p className="small muted">较上周：训练记录 {signed(r.workoutDelta)} 次</p></section>
    <section className="card"><div className="life-section-head"><h2>这一周的饮食</h2><Icon name="utensils"/></div>{loading?<p className="muted">正在加载饮食记录…</p>:<><div className="life-report-grid"><div><span>有记录日均热量</span><strong>{error?'—':r.averageCalories??'—'}<small> kcal</small></strong></div><div><span>饮食记录覆盖</span><strong>{error?'—':r.foodDays}<small> / 7 天</small></strong></div><div><span>已记录餐数</span><strong>{error?'—':r.meals}<small> 餐</small></strong></div><div><span>已填写日均蛋白质</span><strong>{error?'—':r.averageProtein??'—'}<small> g</small></strong></div></div><p className="small muted">只计算有饮食记录的日期；每一天也可能有漏记的餐次，日均表示已记录部分。</p>{!error&&r.calorieDelta!==null&&<p className="small muted">有记录日均较上周 {signed(r.calorieDelta)} kcal。上周覆盖 {r.previous.foodDays} 天，本周覆盖 {r.foodDays} 天。</p>}</>}</section>
    <section className="card"><div className="life-section-head"><h2>体重变化</h2><Icon name="scale"/></div>{r.weightDelta!==null?<><p className="life-calories">{signed(r.weightDelta)} <small>{r.unit}</small></p><p className="small muted">{r.firstWeight.d}：{r.firstWeight.w} {r.unit} → {r.lastWeight.d}：{r.lastWeight.w} {r.unit}</p></>:<p className="muted">本周 {r.weightDays} 天有体重记录，至少两个日期有记录时可查看周内变化。</p>}<p className="small muted">以本周最早和最晚有记录日期的体重比较，不根据饮食照片推算体重。</p></section>
    <section className="card"><h2>每日记录</h2><div className="life-table-wrap"><table><caption>本周训练和已记录饮食</caption><thead><tr><th>日期</th><th>训练</th><th>热量 kcal</th></tr></thead><tbody>{r.days.map(d=><tr key={d.date}><td>{d.label}<span className="life-report-date">{d.date.slice(5)}</span></td><td>{d.workouts?`${d.workouts} 次`:'—'}</td><td>{loading||error?'—':d.calories??'未记录'}</td></tr>)}</tbody></table></div></section>
    <p className="life-notice">这份周报默认仅自己可见。训练容量是重量 × 次数的统计，不是运动消耗热量。</p><button className="life-primary" disabled={loading||!!error} onClick={save}><Icon name="download"/>保存私人周报 TXT</button>{notice&&<p className="life-notice" role="status">{notice}</p>}
  </div>
}
