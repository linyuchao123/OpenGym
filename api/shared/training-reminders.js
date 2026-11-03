// A daily wall-clock reminder, interpreted in the member's chosen IANA timezone.
export function localDay(at,tz){return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at))}
export function nextPlanReminder(time,tz,after=Date.now()){
 const [hour,minute]=time.split(':').map(Number),[year,month,day]=localDay(after,tz).split('-').map(Number)
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
 for(let d=0;d<3;d++){
  const target=Date.UTC(year,month-1,day+d,hour,minute);let candidate=target,latest=target
  for(let i=0;i<4;i++){const p=Object.fromEntries(fmt.formatToParts(new Date(candidate)).map(x=>[x.type,x.value]));const wall=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute),delta=target-wall;if(!delta)break;candidate+=delta;latest=Math.max(latest,candidate);if(i===3)candidate=latest}
  if(candidate>after)return candidate
 }
 throw Error('无法计算下次提醒时间。')
}
