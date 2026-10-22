import { useEffect,useRef } from 'react'
import { isoDate,totals } from '../lib/nutrition.js'

export function calorieDays(meals) {
  const days={}
  for(const meal of meals || []) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(meal.date||'') || Number.isNaN(Date.parse(meal.date)) || new Date(meal.date).toISOString().slice(0,10)!==meal.date)continue
    const row=days[meal.date] ||= {calories:0,meals:0}
    row.calories+=totals([meal]).calories;row.meals++
  }
  return days
}
export default function CalorieHeatmap({meals,onDay,date}) {
  const wrap=useRef(null);const selected=date
  useEffect(()=>{wrap.current.scrollLeft=wrap.current.scrollWidth},[])
  const days=calorieDays(meals);const today=new Date();today.setHours(12,0,0,0)
  const start=new Date(today);start.setDate(start.getDate()-((start.getDay()+6)%7)-52*7)
  const cols=[];const months=[];let lastMonth=-1
  for(let w=0;w<53;w++) {
    const monday=new Date(start);monday.setDate(start.getDate()+w*7)
    months.push(<span key={w}>{monday.getMonth()!==lastMonth?`${monday.getMonth()+1}月`:''}</span>);lastMonth=monday.getMonth()
    cols.push(<div className="hm-col" key={w}>{Array.from({length:7},(_,i)=>{
      const d=new Date(monday);d.setDate(d.getDate()+i);const key=isoDate(d);const row=days[key]
      const level=!row?0:row.calories<800?1:row.calories<1600?2:row.calories<2400?3:4
      const description=`${key}：${row?`${Math.round(row.calories)} kcal，${row.meals} 餐`:'未记录'}`
      return <button key={key} type="button" disabled={d>today} className={`hm-c l${level}${key===isoDate(today)?' today':''}${d>today?' future':''}`} title={description} aria-label={description} aria-pressed={key===selected} onClick={()=>{onDay(key)}} />
    })}</div>)
  }
  const row=days[selected]
  return <section className="card life-heatmap"><div className="life-section-head"><h2>摄入热量热力图</h2><span className="small muted">近 12 个月</span></div>
    <div className="hm-wrap" ref={wrap}><div className="hm-months" >{months}</div><div className="hm-body"><div className="hm-days">{['周一','周二','周三','周四','周五','周六','周日'].map((x,i)=><span key={i}>{x}</span>)}</div><div className="hm-grid">{cols}</div></div></div>
    <div className="hm-legend">少{[0,1,2,3,4].map(n=><span key={n} className={'hm-c l'+n}/>)}多</div>
    <p className="small muted">{selected} · {row?`${Math.round(row.calories)} kcal · ${row.meals} 餐`:'未记录'}。点击格子查看当天饮食，横向滑动查看历史。</p><p className="small muted">颜色只表示已记录热量的多少，不评价好坏或是否达标；空白表示未记录。</p>
  </section>
}
