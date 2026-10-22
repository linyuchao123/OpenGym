const number = value => ({一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,半:.5}[value] ?? Number(value))
// Defaults are editable examples of a serving, not a nutrition database or a weighing result.
export function parsePortion(input) {
  const match=/^\s*([\d.]+|[一二两三四五六七八九十半])\s*(碗|个|杯|份|勺)\s*(.+?)\s*$/.exec(input)
  if(!match)return null
  const count=number(match[1]);if(!Number.isFinite(count)||count<=0||count>100)return null
  const unit=match[2],name=match[3]
  if(/[，,、]|[\d一二两三四五六七八九十半]+(?:碗|个|杯|份|勺)/.test(name))return null
  const gramsEach=unit==='碗'?150:unit==='杯'?250:unit==='勺'?10:unit==='个'&&/鸡蛋/.test(name)?50:100
  return {name,count,unit,gramsEach}
}
export function portionGrams(count,gramsEach){const n=Number(count)*Number(gramsEach);return Number.isFinite(n)&&n>0&&n<=20000?Math.round(n*10)/10:null}
