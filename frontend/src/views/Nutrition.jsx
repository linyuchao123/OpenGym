import {DataRing} from '../components/InsightCharts.jsx'
import {NutritionPlan,FoodLibrary} from '../components/NutritionTools.jsx'
import {targetForDate} from '../lib/nutrition-targets.js'
import {effectiveRoutineIds} from '../lib/history.js'
import {useModalHistory} from '../lib/route-origin.jsx'
import { useRef, useState } from 'react'
import { useLifestyle, assetURL, dataURL, imageBlob, uploadLifestyle } from '../lib/lifestyle.js'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { MEAL_TYPES, isoDate, nutritionStats, totals } from '../lib/nutrition.js'
import { reuseMeal,previousMealDate } from '../lib/meal-reuse.js'
import RecordStatus from '../components/RecordStatus.jsx'
import FoodPortion from '../components/FoodPortion.jsx'
import CalorieHeatmap from '../components/CalorieHeatmap.jsx'
import Icon from '../components/Icon.jsx'

const MEAL_STYLES = {unknown:'信息不足 / 未分类', 'fat-loss':'减脂餐（风格参考）',indulgent:'放纵餐（较丰盛）',balanced:'正常餐'}
const blankItem = () => ({ name:'', grams:'', calories:'', protein:'', carbs:'', fat:'' })
const freshMeal = date => ({ date, type:'breakfast', items:[blankItem()], photo:'', note:'', mealStyle:'unknown',styleReason:'', source:'manual' })
const round = n => Math.round(n * 10)/10

export default function Nutrition() {
  const { meals, profile, ai, loading, error, owner, syncingMeals, pendingMeals=[], templates = [], saveTemplate, deleteTemplate, saveMeal, deleteMeal } = useLifestyle()
  const user = useStore(s => s.user)
  const [date, setDate] = useState(isoDate(new Date()))
  const [mode, setMode] = useState('week')
  const [tab,setTab]=useState('today')
  const S=useStore(s=>s.S)
  const nutritionConfig=useLifestyle(s=>s.nutritionConfig),nutritionHistory=useLifestyle(s=>s.nutritionHistory||[]),foods=useLifestyle(s=>s.foods||[])
  const target=targetForDate(nutritionConfig,date,effectiveRoutineIds(S,date).length>0||(S.workouts||[]).some(w=>w.d===date),profile.calorieGoal,nutritionHistory)
  const addFood=item=>{setReuseBase(null);setDraft({...freshMeal(date),items:[item]});setReviewed(false);setMessage('');setAiNote('')}
  const [draft, setDraft] = useState(null)
  const [busyLocal, setBusy] = useState(false)
  const busy=busyLocal||syncingMeals
  const [message, setMessage] = useState('')
  const [aiNote, setAiNote] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [remove, setRemove] = useState('')
  const [expanded, setExpanded] = useState(false)
  const file = useRef(null)
  const [reuseBase,setReuseBase] = useState(null)
  const [factor,setFactor] = useState('1')
  const [templateDraft,setTemplateDraft] = useState(null)
  const [templateName,setTemplateName] = useState('')
  const [deleteFavorite,setDeleteFavorite] = useState('')
  const [previousOpen,setPreviousOpen] = useState(false)
  useModalHistory(!!draft,()=>setDraft(null),busy)
  const yesterday = meals.filter(m=>m.date===previousMealDate(date))
  const openReuse = meal => { setReuseBase(structuredClone(meal));setFactor('1');setDraft(reuseMeal(meal,date));setReviewed(false);setAiNote('');setMessage('') }
  const favorite = async e => { e.preventDefault();setBusy(true);setMessage('');try{await saveTemplate({...templateDraft,id:undefined,name:templateName.trim()});setTemplateDraft(null);setMessage('已加入常吃餐，复用时确认后才会保存。')}catch(e){setMessage(e.message)}finally{setBusy(false)} }
  const removeFavorite = async id => {setBusy(true);try{await deleteTemplate(id);setDeleteFavorite('')}catch(e){setMessage(e.message)}finally{setBusy(false)}}
  const stats = nutritionStats(meals, date, mode)
  const daily = meals.filter(m => m.date === date).sort((a,b) => Object.keys(MEAL_TYPES).indexOf(a.type)-Object.keys(MEAL_TYPES).indexOf(b.type))
  const dayTotal = totals(daily)
  const nutrientKnown=key=>daily.some(m=>(m.items||[]).some(i=>i[key]!=null&&i[key]!==''))
  const setField = (key, value) => setDraft(d => ({ ...d, [key]:value }))
  const editItem = (at, key, value) => { setDraft(d => ({ ...d, mealAdvice:'', items:d.items.map((x,i) => i === at ? { ...x,[key]:value,...(key==='grams'?{gramsSource:'manual'}:{}) } : x) })); setReviewed(false) }
  const choosePhoto = async e => {
    const selected = e.target.files?.[0]; e.target.value = ''; if (!selected) return
    setReuseBase(null); setBusy(true); setMessage('')
    try {
      const blob = await imageBlob(selected)
      const photo = user ? (await uploadLifestyle(blob)).id : await dataURL(blob)
      setDraft(d => ({ ...(d || freshMeal(date)), photo, source:'manual', items:[blankItem()], mealStyle:'unknown', styleReason:'' })); setReviewed(false); setAiNote('')
    } catch(e) { setMessage(e.message) } finally { setBusy(false) }
  }
  const recognize = async () => {
    setBusy(true); setMessage('')
    try {
      const result = await api('/api/life/recognize', { method:'POST', timeout:70000, body:JSON.stringify({ photo:draft.photo, hint:draft.note }) })
      setDraft(d => ({ ...d, items:result.items, mealAdvice:result.mealAdvice||'',adviceGoal:result.adviceGoal||'habit', mealStyle:result.mealStyle || 'unknown', styleReason:result.styleReason || '', source:'ai-reviewed' })); setAiNote(result.note || '请核对食物名称、分量与烹饪方式。'); setReviewed(false)
    } catch(e) { setMessage(e.message) } finally { setBusy(false) }
  }
  const advise=async()=>{setBusy(true);setMessage('');try{const items=draft.items.map(x=>({...x,calories:Number(x.calories)}));const result=await api('/api/life/advice',{method:'POST',timeout:70000,body:JSON.stringify({items})});setDraft(d=>({...d,mealAdvice:result.mealAdvice,adviceGoal:result.adviceGoal,adviceGenerated:true}));setReviewed(false)}catch(e){setMessage(e.message)}finally{setBusy(false)}}
  const save = async e => {
    e.preventDefault(); setMessage('')
    if (reuseBase && (!Number.isFinite(Number(factor)) || Number(factor)<.25 || Number(factor)>10)) {setMessage('份量倍数请填写 0.25 至 10。');return}
    if ((draft.source === 'ai-reviewed'||draft.adviceGenerated) && !reviewed) { setMessage('请先核对 AI 估算并勾选确认。'); return }
    const items = draft.items.map(x => ({ ...x, calories:Number(x.calories), grams:x.grams === '' || x.grams == null ? null : Number(x.grams), ...Object.fromEntries(['protein','carbs','fat'].map(k => [k,x[k] === '' || x[k] == null ? null : Number(x[k])])) }))
    if (items.some(x => !x.name.trim() || x.calories === '' || !Number.isFinite(x.calories) || x.calories < 0 || x.calories > 20000)) { setMessage('请填写食物名称和有效热量。'); return }
    setBusy(true)
    try { const saved=await saveMeal({ ...draft, items }); setDate(draft.date); setDraft(null); setMessage(saved?._pending?'已保存到本机，等待联网同步；请保留本机缓存。':'饮食记录已保存。') }
    catch(e) { setMessage(e.message) } finally { setBusy(false) }
  }
  const erase = async id => { setBusy(true); try { await deleteMeal(id); setRemove(''); setMessage('记录已删除。') } catch(e) { setMessage(e.message) } finally { setBusy(false) } }
  return <div className="narrow life-page life-nutrition">
    <header className="hdr"><div><h1>饮食</h1><div className="sub">好好吃饭，也记录每一份进步</div></div><button className="life-icon" aria-label="新增饮食记录" disabled={loading || busy} onClick={() => { setReuseBase(null); setDraft(freshMeal(date)); setMessage(''); setAiNote(''); setReviewed(false) }}><Icon name="plus" /></button></header>
    <div className="nutrition-tabs" role="tablist" aria-label="饮食功能">{[['today','今日记录'],['plan','饮食计划'],['foods','食物库'],['trends','趋势']].map(([key,label],i)=><button key={key} id={'nutrition-tab-'+key} role="tab" aria-controls={'nutrition-panel-'+key} aria-selected={tab===key} tabIndex={tab===key?0:-1} onClick={()=>setTab(key)} onKeyDown={e=>{const keys=['today','plan','foods','trends'];let next;if(e.key==='ArrowRight')next=keys[(i+1)%4];if(e.key==='ArrowLeft')next=keys[(i+3)%4];if(e.key==='Home')next=keys[0];if(e.key==='End')next=keys[3];if(next){e.preventDefault();setTab(next);document.getElementById('nutrition-tab-'+next)?.focus()}}}>{label}</button>)}</div>
    {user?.admin ? <details className="nutrition-sync"><summary>数据保存状态</summary><RecordStatus/></details> : <RecordStatus warningsOnly/>}
    {!user && <p className="life-notice">当前是本机饮食日记，照片和记录保存在此浏览器。登录后使用服务器记录及 AI 识别；访客记录暂不会自动转入账号，可先导出备份。</p>}
    {error && <p className="life-error" role="alert">{error}</p>}
    {message && <p className="life-notice" role="status">{message}</p>}
    <div className="life-date"><label>查看日期<input type="date" aria-label="饮食日期" value={date} onChange={e=>{if(e.target.value)setDate(e.target.value)}}/></label></div>
    <div role="tabpanel" id={'nutrition-panel-'+tab} aria-labelledby={'nutrition-tab-'+tab}>
    {tab==='plan'&&<NutritionPlan date={date}/>}
    <input ref={file} type="file" accept="image/*" className="life-hidden-input" aria-label="选择餐食照片" onChange={choosePhoto}/>
    <div className="life-nutrition-layout nutrition-focused-layout"><div className="life-nutrition-main">
    {tab==='foods'&&<FoodLibrary onUse={addFood}/>}
    <div hidden={tab!=='today'}>
    <section className="card life-energy nutrition-energy-v2"><div className="nutrition-energy-heading"><DataRing value={daily.length?round(dayTotal.calories):0} total={target.calories||1} label="已记录热量" suffix="kcal"/><div><span className="small muted">{target.label}</span><strong>{target.calories>0?target.calories+' kcal':'尚未设置'}</strong><p>{target.calories>0?(dayTotal.calories>target.calories?`记录比目标多 ${round(dayTotal.calories-target.calories)} kcal`:`距目标还差 ${round(target.calories-dayTotal.calories)} kcal`):'先记下今天的一餐，目标可稍后设置。'}</p><button className="life-link" onClick={()=>setTab('plan')}>调整饮食目标</button></div></div>
      <div className="life-macros">{[['protein','蛋白质'],['carbs','碳水'],['fat','脂肪']].map(([key,label])=><div key={key}><span>{label}</span><strong>{nutrientKnown(key)?round(dayTotal[key]):'未填写'}<small>{target[key]>0?` / ${target[key]}`:''} g</small></strong>{target[key]>0&&nutrientKnown(key)&&<progress max={target[key]} value={Math.min(dayTotal[key],target[key])}/>}</div>)}</div><p className="small muted">{daily.length?'这里只汇总已记录部分，未记餐次可能影响差额。':'今天尚未记餐，0表示已记录量，不代表没有进食。'}</p>
    </section>
    <div className="life-actions"><button className="life-primary" disabled={loading || busy} onClick={() => { setReuseBase(null); setDraft(freshMeal(date)); setAiNote(''); setMessage(''); setReviewed(false) }}>＋ 记录一餐</button><button className="life-secondary" disabled={loading || busy} onClick={() => { setReuseBase(null); setDraft(freshMeal(date)); setAiNote(''); setMessage(''); setReviewed(false); file.current?.click() }}><Icon name="camera" />拍照 / 选照片</button></div>
    </div>
    <details className="card life-favorites" hidden={tab!=='today'&&tab!=='foods'}><summary>常吃餐与快速复用 <small>收藏 {templates.length} 份</small></summary><div className="life-section-head"><h2>常吃餐，快速记</h2><button className="life-link" disabled={loading||busy} onClick={()=>setPreviousOpen(v=>!v)}>{previousOpen?'收起前一天':'复用前一天'}</button></div>
      <p className="small muted">收藏常吃的一餐，下次调整份量后再确认保存。</p>{templates.length?<div className="life-favorite-list">{templates.map(t=><div key={t.id} className="life-favorite-row"><button disabled={busy||loading} onClick={()=>openReuse(t)}><strong>{t.name}</strong><span>{t.items.map(i=>i.name).join(' · ')} · {round(totals([t]).calories)} kcal</span></button><button className="life-link" aria-label={'移除常吃餐 '+t.name} disabled={busy} onClick={()=>setDeleteFavorite(t.id)}>移除</button>{deleteFavorite===t.id&&<div className="life-notice">只移除常吃餐收藏，历史饮食记录保留。<div className="life-actions"><button disabled={busy} onClick={()=>removeFavorite(t.id)}>确认移除</button><button onClick={()=>setDeleteFavorite('')}>取消</button></div></div>}</div>)}</div>:<p className="small muted">保存第一餐后，点击记录上的「收藏为常吃餐」。</p>}
      {previousOpen&&<div className="life-previous-meals"><h3>{previousMealDate(date)} 的饮食</h3>{yesterday.length?yesterday.map(m=><button key={m.id} className="life-secondary" disabled={busy} onClick={()=>openReuse(m)}>{MEAL_TYPES[m.type]} · {m.items.map(i=>i.name).join('、')}</button>):<p className="small muted">前一天没有饮食记录，可手动新增一餐。</p>}</div>}
    </details>
    <section hidden={tab!=='today'}><div className="nutrition-meal-slots">{Object.entries(MEAL_TYPES).map(([key,label])=>{const rows=daily.filter(m=>m.type===key);return <button key={key} disabled={loading||busy} onClick={()=>{setReuseBase(null);setDraft({...freshMeal(date),type:key});setReviewed(false);setMessage('');setAiNote('')}}><span>{label}</span><strong>{rows.length?round(totals(rows).calories)+' kcal':'还未记录'}</strong><small>＋ 记录{label}</small></button>})}</div><div className="life-section-head"><h2>这一天吃了什么</h2><span className="small muted">{date}</span></div>{loading ? <div className="card muted">正在加载饮食记录…</div> : daily.length ? daily.map(meal => <article className="card life-meal" key={meal.id}>
      {meal.photo && <img src={assetURL(meal.photo)} alt={`${MEAL_TYPES[meal.type]}餐食照片`} loading="lazy" />}
      <div className="life-section-head"><h3>{MEAL_TYPES[meal.type]}</h3><b>{round(totals([meal]).calories)} kcal</b></div>
      <p className="life-tag">{MEAL_STYLES[meal.mealStyle] || MEAL_STYLES.unknown}</p>{meal.styleReason && <p className="small muted">{meal.styleReason}</p>}<p>{meal.items.map(i=>i.name+(i.grams!=null?` ${i.grams}g`:'')).join(' · ')}</p>{meal.items.some(i=>i.advice) && <details><summary>每道菜的温馨建议</summary>{meal.items.filter(i=>i.advice).map((i,n)=><p className="small muted" key={n}><strong>{i.name}：</strong>{i.advice}</p>)}</details>}{meal.mealAdvice&&<div className="life-notice"><strong>整餐搭配参考</strong><p>{meal.mealAdvice}</p><small>生成时目标：{({gain:'增肌',loss:'减脂',maintain:'维持',habit:'记录习惯'})[meal.adviceGoal]||'记录习惯'} · AI 估算，请结合实际情况确认</small></div>}{meal.note && <p className="small muted">{meal.note}</p>}<span className="life-tag">{meal._pending?'本机已保存 · 等待同步':meal.source==='ai-reviewed'?'AI 估算 · 已确认':'手动记录'}</span>
      <div className="life-actions"><button className="life-secondary" disabled={busy} onClick={()=>openReuse(meal)}>复用这餐</button><button className="life-secondary" disabled={busy} onClick={()=>{setTemplateDraft(meal);setTemplateName(`${MEAL_TYPES[meal.type]} · ${meal.items[0]?.name || '我的常吃餐'}`.slice(0,60));setMessage('')}}>收藏为常吃餐</button></div><div className="life-meal-controls"><button onClick={() => { setReuseBase(null); setDraft(structuredClone(meal)); setAiNote(''); setReviewed(true); setMessage('') }}>编辑</button><button className="life-link danger" onClick={() => setRemove(meal.id)}>删除</button></div>
      {remove===meal.id && <div className="life-notice">删除这条饮食记录？<div className="life-actions"><button disabled={busy} onClick={() => erase(meal.id)}>确认删除</button><button onClick={() => setRemove('')}>取消</button></div></div>}
    </article>) : <div className="card life-empty"><Icon name="utensils" /><h3>今天的第一餐，从这里开始</h3><p>拍张照片，或手动写下食物和热量。</p></div>}</section>
    <button className="life-link" onClick={() => { const blob=new Blob([JSON.stringify({profile,meals,templates,foods,nutritionConfig,nutritionHistory},null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=`饮食记录-${isoDate(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000) }}>导出饮食记录 JSON</button>
    </div><aside className="life-nutrition-stats" hidden={tab!=='trends'}>    <section className="card"><div className="life-section-head"><h2>摄入趋势</h2><span className="small muted">{stats.days} 天有记录</span></div><div className="life-segments">{[['day','日'],['week','周'],['month','月'],['year','年']].map(([key,label]) => <button key={key} aria-pressed={mode===key} className={mode===key?'on':''} onClick={() => setMode(key)}>{label}</button>)}</div>
      <div className="life-stat-pair"><div><span>总摄入</span><strong>{round(stats.total.calories)} <small>kcal</small></strong></div><div><span>有记录日均</span><strong>{stats.days?round(stats.average):'—'} <small>kcal</small></strong></div></div>
      {stats.days>0?<div className={'life-chart '+(mode==='month'?'dense':'')} aria-label="热量统计图">{stats.buckets.map(b => <div key={b.key} className="life-chart-col" title={`${b.label}：${round(b.calories)} kcal`}><div className="life-chart-track"><div style={{ height:`${b.calories ? Math.max(1,b.calories/Math.max(1,...stats.buckets.map(x=>x.calories))*100) : 0}%` }} /></div><span>{b.label}</span></div>)}</div>:<div className="life-chart-empty">这段时间还没有记录，记下一餐后就能看到摄入趋势。</div>}
      <p className="small muted">空白日期表示没有记录。日均只计算有记录的日期，不把漏记当作零摄入。</p>
      <button className="life-link" onClick={() => setExpanded(v=>!v)}>{expanded?'收起明细':'查看统计明细'}</button>
      {expanded && <div className="life-table-wrap"><table><caption>摄入统计 · kcal</caption><thead><tr><th>日期 / 餐次</th><th>热量</th></tr></thead><tbody>{stats.buckets.map(b => <tr key={b.key}><td>{mode==='day'?b.label:b.key}</td><td>{round(b.calories)}</td></tr>)}</tbody></table></div>}
    </section>
    <CalorieHeatmap meals={meals} date={date} onDay={d=>{setDate(d);setTab('today')}} />
</aside></div></div>
    {templateDraft && <div className="life-modal-backdrop"><section className="life-modal" role="dialog" aria-modal="true" aria-label="收藏常吃餐"><div className="life-section-head"><h2>收藏为常吃餐</h2><button className="life-icon" aria-label="关闭收藏" disabled={busy} onClick={()=>setTemplateDraft(null)}><Icon name="x"/></button></div><form className="life-form" onSubmit={favorite}><label>给这餐起个名字<input required maxLength={60} value={templateName} onChange={e=>setTemplateName(e.target.value)} placeholder="例如：我的日常早餐"/></label><p className="small muted">保存食物和营养数据，复用时不携带旧照片，也不会自动新增饮食记录。</p>{message&&<p role="alert" className="life-error">{message}</p>}<button className="life-primary" disabled={busy||!templateName.trim()}>保存常吃餐</button></form></section></div>}
    {draft && <div className="life-modal-backdrop"><section className="life-modal" role="dialog" aria-modal="true" aria-label="记录饮食"><div className="life-section-head"><h2>{draft.id?'编辑饮食':'记录一餐'}</h2><button className="life-icon" aria-label="关闭饮食编辑" disabled={busy} onClick={() => setDraft(null)}><Icon name="x" /></button></div>
      <form onSubmit={save} className="life-form">{reuseBase&&<div className="life-notice"><strong>复用一餐 · 保存前请核对</strong><label>份量倍数<input required type="number" min="0.25" max="10" step="0.25" value={factor} onChange={e=>{const value=e.target.value;setFactor(value);if(Number(value)>=.25&&Number(value)<=10){setDraft(d=>({...reuseMeal(reuseBase,d.date,Number(value)),type:d.type}));setReviewed(false)}}}/></label><p>先调整份量，再修改下方食物。倍数按原记录换算，实际烹饪和分量仍需核对。</p></div>}<div className="life-form-row"><label>日期<input type="date" required value={draft.date} onChange={e => setField('date',e.target.value)} /></label><label>餐次<select value={draft.type} onChange={e => setField('type',e.target.value)}>{Object.entries(MEAL_TYPES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
      <button type="button" className="life-photo-picker" disabled={busy} onClick={() => file.current?.click()}>{draft.photo?<img src={assetURL(draft.photo)} alt="待记录的餐食" />:<><Icon name="camera" /><span>拍照或上传餐食照片</span></>}</button>
      <label>分量 / 烹饪补充<textarea placeholder="例如：米饭一小碗，鸡胸肉约 150g，少油" maxLength={500} value={draft.note} onChange={e => setField('note',e.target.value)} /></label>
      <button type="button" className="life-ai-button" disabled={busy || !draft.photo || !user || !ai.configured} onClick={recognize}><Icon name="sparkles" />{busy?'正在处理…':'发送到 DeepSeek 识别食物与热量'}</button>
      <p className="small muted">{!user?'登录后可使用 AI 识别。':!ai.configured?'管理员尚未配置 DeepSeek 密钥，当前可拍照并手动记录。':'点击识别会将这张餐食照片及补充文字发送至站点配置的 DeepSeek 服务。'} 识别结果是估算，分量、油和调味会影响热量。</p>
      {draft.mealAdvice&&<p className="life-notice"><strong>整餐搭配参考：</strong>{draft.mealAdvice}</p>}
      {aiNote && <p className="life-notice">{aiNote}</p>}
      <label>餐食类型（可修改）<select value={draft.mealStyle || 'unknown'} onChange={e=>{setDraft(d=>({...d,mealStyle:e.target.value,styleReason:''}));setReviewed(false)}}>{Object.entries(MEAL_STYLES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      {draft.styleReason && <p className="life-notice">{draft.styleReason}</p>}<p className="small muted">类型仅作餐食风格参考，不代表能否减脂；偶尔吃丰盛一些无需跳餐或额外运动补偿。</p>
      {draft.items.map((item,i) => <fieldset className="life-food-item" key={i}><legend>食物 {i+1}</legend><FoodPortion item={item} onApply={patch=>{setDraft(d=>({...d,mealAdvice:'',items:d.items.map((x,n)=>n===i?{...x,...patch}:x)}));setReviewed(false)}}/><label>食物名称<input required maxLength={80} value={item.name} onChange={e=>editItem(i,'name',e.target.value)} placeholder="例如：鸡胸肉" /></label><div className="life-form-row"><label>分量（g，可选）<input type="number" min="0" max="20000" step="any" value={item.grams??''} onChange={e=>editItem(i,'grams',e.target.value)} /></label><label>本份热量（kcal）<input type="number" required min="0" max="20000" step="any" value={item.calories} onChange={e=>editItem(i,'calories',e.target.value)} /></label></div><label>重量来源<select value={item.gramsSource||'manual'} onChange={e=>editItem(i,'gramsSource',e.target.value)}><option value="manual">手动填写</option><option value="weighed">实际称重</option><option value="estimated">份量估算</option></select></label><div className="life-form-row macros">{[['protein','蛋白质'],['carbs','碳水'],['fat','脂肪']].map(([key,label])=><label key={key}>{label}（g）<input type="number" min="0" max="20000" step="any" value={item[key]??''} onChange={e=>editItem(i,key,e.target.value)} /></label>)}</div><label>这道菜的温馨建议<textarea maxLength={300} value={item.advice||''} placeholder="AI 识别后会给出建议，也可以自己补充" onChange={e=>editItem(i,'advice',e.target.value)} /></label>{draft.items.length>1 && <button type="button" className="life-link danger" onClick={()=>setDraft(d=>({...d,items:d.items.filter((_,index)=>index!==i)}))}>移除这项</button>}</fieldset>)}
      {draft.items.length<30 && <button type="button" className="life-link" onClick={()=>setDraft(d=>({...d,items:[...d.items,blankItem()]}))}>＋ 再加一种食物</button>}
      <button type="button" className="life-ai-button" disabled={busy||!user||!ai.configured||draft.items.some(i=>!i.name.trim()||i.calories==='')} onClick={advise}>发送食物文字，生成整餐建议</button><p className="small muted">只将这餐的食物与营养文字发送至站点配置的 AI 服务，结合你在个人资料中选择的目标。生成后需核对保存。</p>
      {(draft.source==='ai-reviewed'||draft.adviceGenerated) && <label className="life-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)} />我已核对食物、分量、热量与 AI 建议</label>}
      {message && <p className="life-error" role="alert">{message}</p>}
      <button className="life-primary" disabled={busy || loading || (owner!== (user?.id || 'guest'))}>{busy?'正在保存…':'确认并保存这餐'}</button></form>
    </section></div>}
  </div>
}
