import {useState} from 'react'
import {parsePortion,portionGrams} from '../lib/food-portions.js'
export default function FoodPortion({item,onApply}){
 const [text,setText]=useState(item.portionText||'');const [portion,setPortion]=useState(null);const [error,setError]=useState('')
 const parse=()=>{const p=parsePortion(text);setPortion(p);setError(p?'':'可以输入“一碗米饭”“两个鸡蛋”“一杯牛奶”，或直接填写下方克数。')}
 const grams=portion?portionGrams(portion.count,portion.gramsEach):null
 return <details className="life-portion"><summary>用碗 / 个 / 杯估算份量</summary><div className="life-actions"><input aria-label="中式份量" placeholder="例如：一碗米饭" value={text} maxLength={60} onChange={e=>setText(e.target.value)}/><button type="button" className="life-secondary" onClick={parse}>解析份量</button></div>{error&&<p role="alert">{error}</p>}{portion&&<><div className="life-form-row"><label>数量（{portion.unit}）<input aria-label="份量数量" type="number" min="0.1" step="any" value={portion.count} onChange={e=>setPortion(p=>({...p,count:e.target.value}))}/></label><label>每{portion.unit}估算克数<input aria-label="每单位克数" type="number" min="1" max="20000" step="any" value={portion.gramsEach} onChange={e=>setPortion(p=>({...p,gramsEach:e.target.value}))}/></label></div><p className="small muted">估算 {grams??'—'} g。碗杯大小、去皮和可食部分会影响重量，请修改默认值；这里不会自动推算热量。</p><button type="button" className="life-secondary" disabled={!grams} onClick={()=>onApply({name:item.name||portion.name,grams,portionText:text,gramsSource:'estimated'})}>采用估算克数</button></>}</details>
}
