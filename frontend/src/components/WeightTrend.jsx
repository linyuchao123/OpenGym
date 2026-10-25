import {useMemo,useState} from 'react'
import LineChart from './LineChart.jsx'
export function weightReadings(rows){const days=new Map();for(const row of rows||[]){if(!/^\d{4}-\d{2}-\d{2}$/.test(row.d)||Number.isNaN(Date.parse(row.d))||new Date(row.d).toISOString().slice(0,10)!==row.d||!Number.isFinite(Number(row.w))||Number(row.w)<=0)continue;const prev=days.get(row.d);if(!prev||Number(row.t||0)>=Number(prev.t||0))days.set(row.d,row)}return [...days.values()].sort((a,b)=>a.d.localeCompare(b.d))}
export default function WeightTrend({rows=[],unit='kg',goal}){
 const [range,setRange]=useState(30),[showGoal,setShowGoal]=useState(false);
 const readings=useMemo(()=>weightReadings(rows),[rows]);
 const points=useMemo(()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-range+1);return readings.filter(r=>range===0||new Date(r.d+'T12:00:00')>=d).map(r=>({t:new Date(r.d+'T12:00:00').getTime(),y:Number(r.w),d:r.d}))},[readings,range]);
 const last=points.at(-1),first=points[0],change=points.length>1?Math.round((last.y-first.y)*10)/10:null;
 const recent=last?points.filter(p=>last.t-p.t<7*86400000):[],avg=recent.length?Math.round(recent.reduce((s,p)=>s+p.y,0)/recent.length*10)/10:null;
 return <div className="weight-trend"><div className="insight-range" aria-label="体重趋势范围">{[[7,'7天'],[30,'30天'],[90,'90天'],[0,'全部']].map(([n,label])=><button key={n} aria-pressed={n===range} onClick={()=>setRange(n)}>{label}</button>)}</div><div className="weight-trend-facts"><div><span>所选期间变化</span><strong>{change===null?'未足两天':`${change>0?'+':''}${change} ${unit}`}</strong></div><div><span>末次记录前7天均值</span><strong>{avg===null?'未记录':`${avg} ${unit}`}</strong></div></div>
 {points.length?<LineChart points={points} h={170} unit={unit} goal={showGoal&&goal>0?goal:null}/>:<p className="insight-empty">这段时间没有称重记录，点击「记录体重」添加。</p>}
 <p className="small muted">每点为当天最后一次称重，连线仅连接实际记录。点击曲线查看日期与数值；短期波动不等于脂肪变化。</p>{goal>0&&<button className="life-link" aria-pressed={showGoal} onClick={()=>setShowGoal(v=>!v)}>{showGoal?'隐藏':'显示'}目标参考线 · {goal} {unit}</button>}
 </div>
}
