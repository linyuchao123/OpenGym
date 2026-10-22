export const MEAL_TYPES = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }
export const isoDate = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
export function nutritionPeriod(date, mode) {
  const d = new Date(`${date}T12:00:00`)
  if (mode === 'week') d.setDate(d.getDate() - (d.getDay()+6)%7)
  if (mode === 'month') d.setDate(1)
  if (mode === 'year') { d.setMonth(0, 1) }
  const start = isoDate(d); const end = new Date(d)
  if (mode === 'day') end.setDate(end.getDate()+1)
  if (mode === 'week') end.setDate(end.getDate()+7)
  if (mode === 'month') end.setMonth(end.getMonth()+1)
  if (mode === 'year') end.setFullYear(end.getFullYear()+1)
  return { start, end: isoDate(end) }
}
export function totals(meals) {
  return meals.flatMap(m => m.items || []).reduce((out, x) => {
    for (const key of ['calories','protein','carbs','fat']) if (x[key] !== null && x[key] !== '' && Number.isFinite(Number(x[key]))) out[key] += Number(x[key])
    return out
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 })
}
export function nutritionStats(meals, date, mode) {
  const period = nutritionPeriod(date, mode)
  const selected = meals.filter(m => m.date >= period.start && m.date < period.end)
  const days = new Set(selected.map(m => m.date)).size
  const buckets = []
  if (mode === 'day') {
    for (const [key, label] of Object.entries(MEAL_TYPES)) buckets.push({ key, label, ...totals(selected.filter(m => m.type === key)) })
  } else if (mode === 'year') {
    for (let month = 1; month <= 12; month++) { const key = `${date.slice(0,4)}-${String(month).padStart(2,'0')}`; buckets.push({ key, label: `${month}月`, ...totals(selected.filter(m => m.date.startsWith(key))) }) }
  } else {
    const d = new Date(`${period.start}T12:00:00`)
    while (isoDate(d) < period.end) { const key = isoDate(d); buckets.push({ key, label: mode === 'week' ? ['日','一','二','三','四','五','六'][d.getDay()] : String(d.getDate()), ...totals(selected.filter(m => m.date === key)) }); d.setDate(d.getDate()+1) }
  }
  return { ...period, selected, buckets, days, total: totals(selected), average: days ? totals(selected).calories/days : 0 }
}
