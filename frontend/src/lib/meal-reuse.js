const round = n => Math.round(n * 100) / 100
export function reuseMeal(meal, date, factor = 1) {
  if (!Number.isFinite(factor) || factor < .25 || factor > 10) throw new Error('份量倍数请填写 0.25 至 10。')
  return { date, type: meal.type, photo: '', note: meal.note || '', source: meal.source === 'ai-reviewed' ? 'ai-reviewed' : 'manual',
    mealAdvice: factor===1?meal.mealAdvice||'':'',adviceGoal:meal.adviceGoal||'habit',
    mealStyle: factor === 1 ? meal.mealStyle || 'unknown' : 'unknown', styleReason: factor === 1 ? meal.styleReason || '' : '',
    items: meal.items.map(item => {
      const next = { ...item, advice: factor === 1 ? item.advice || '' : '' }
      for (const key of ['grams','calories','protein','carbs','fat']) next[key] = item[key] == null || item[key] === '' ? null : round(Number(item[key]) * factor)
      return next
    }) }
}
export function previousMealDate(date) { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
