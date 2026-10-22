import { doneUnits,setUnits } from '../lib/history.js'
import { isWarmupRow } from '../lib/workout-model.js'
export default function WorkoutReference({entry,reference,best=false,label}) {
  const current=entry.sets.filter(s=>!isWarmupRow(s))
  const previous=(reference?(best?[reference.set]:reference.sets||[]):[]).filter(s=>s&&!isWarmupRow(s))
  const done=current.reduce((n,s)=>n+doneUnits(s),0), total=current.reduce((n,s)=>n+setUnits(s),0)
  return <div className="workout-reference"><div className="workout-reference-progress"><strong>工作组进度</strong><span>{done} / {total}</span></div>{previous.length>0&&<details><summary>{best?'展开最佳组参考':'展开上次逐组参考'} · {reference.d}</summary><p>按工作组顺序展示，热身组不参与对照；参考数值不会自动覆盖本次记录。</p><div className="life-table-wrap"><table><thead><tr><th>组</th><th>{best?'最佳组':'上次'}</th><th>本次</th></tr></thead><tbody>{Array.from({length:Math.max(previous.length,current.length)},(_,i)=><tr key={i}><th>{i+1}</th><td>{previous[i]?label(previous[i],reference.target):'—'}</td><td>{current[i]?<>{label(current[i],entry.target)}<small>{doneUnits(current[i])===setUnits(current[i])?'已完成':doneUnits(current[i])?'部分完成':'待记录'}</small></>:'—'}</td></tr>)}</tbody></table></div></details>}</div>
}
