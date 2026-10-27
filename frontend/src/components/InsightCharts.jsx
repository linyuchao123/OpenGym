// Small, accessible charts. Null is a missing observation, never a zero measurement.
export function DayBars({days,value,label,unit='',color='var(--acc)'}){
 const values=days.map(value),max=Math.max(1,...values.filter(Number.isFinite));
 return <figure className="insight-figure"><figcaption>{label}</figcaption><div className="insight-bars" role="img" aria-label={days.map((d,i)=>`${d.label} ${values[i]==null?'未记录':values[i]+' '+unit}`).join('；')}>{days.map((d,i)=><div className="insight-bar-col" key={d.date||d.key||i}><span className="insight-bar-number">{values[i]??'·'}</span><div className="insight-bar-track">{values[i]!=null&&<i style={{height:`${Math.max(values[i]>0?3:0,values[i]/max*100)}%`,background:color}}/>}{values[i]==null&&<span className="insight-missing">未记</span>}</div><small>{d.label}</small></div>)}</div></figure>
}
export function DataRing({value,total=7,label,color='var(--acc)',suffix='天'}){
 const percentage=Math.min(1,Math.max(0,value/Math.max(1,total)));
 return <div className="data-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="41" fill="none" stroke="var(--surface-3)" strokeWidth="8"/><circle cx="50" cy="50" r="41" fill="none" stroke={color} strokeWidth="8" pathLength="100" strokeDasharray={`${percentage*100} 100`} strokeLinecap="round" transform="rotate(-90 50 50)"/></svg><div><strong>{value}<small>/{total}</small></strong><span>{label}{suffix&&` · ${suffix}`}</span></div></div>
}
export function MiniTrend({points,label,unit='',color='var(--acc)'}){
 const valid=points.filter(p=>Number.isFinite(p.value));
 if(!valid.length)return <div className="insight-empty">尚无{label}记录</div>;
 const low=Math.min(...valid.map(p=>p.value)),high=Math.max(...valid.map(p=>p.value)),pad=Math.max(.4,(high-low)*.25),min=low-pad,max=high+pad;
 const X=p=>48+p.index/Math.max(1,points.length-1)*270,Y=p=>24+(max-p.value)/(max-min)*118;
 // Missing observations split the line rather than inventing values for those dates.
 const segments=[];let run=[];points.forEach((p,index)=>{if(Number.isFinite(p.value))run.push({...p,index});else if(run.length){segments.push(run);run=[]}});if(run.length)segments.push(run);
 return <figure className="insight-figure"><figcaption>{label} <small>{unit}</small></figcaption><svg className="insight-trend" viewBox="0 0 340 180" role="img" aria-label={points.map(p=>`${p.label} ${p.value==null?'未记录':p.value+' '+unit}`).join('；')}>
 {[low,high].filter((n,i,a)=>a.indexOf(n)===i).map(n=><g key={n}><line x1="48" x2="318" y1={Y({value:n})} y2={Y({value:n})} stroke="var(--sep)" strokeDasharray="3 4"/><text x="42" y={Y({value:n})+4} textAnchor="end">{Math.round(n*10)/10}</text></g>)}
 {segments.map((seg,i)=><g key={i}>{seg.length>1&&<polyline points={seg.map(p=>`${X(p)},${Y(p)}`).join(' ')} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round"/>}{seg.map(p=><g key={p.index}><circle cx={X(p)} cy={Y(p)} r="4" fill={color}/><title>{p.label}：{p.value} {unit}</title></g>)}</g>)}
 {points.map((p,i)=> (points.length<=12||i===0||i===points.length-1||i%Math.ceil(points.length/7)===0)&&<text key={i} x={48+i/Math.max(1,points.length-1)*270} y="169" textAnchor="middle">{p.label}</text>)}
 </svg></figure>
}
