import {MOBILE,shareExportBlob} from './mobile.js'
export const REPORT_DESIGNS={sport:'运动数据卡',editorial:'周刊海报'}
export const REPORT_PALETTES={blue:'#0869ce',green:'#117955',orange:'#b44d17'}
export async function deliverReport(blob,name,share=false){
 if(MOBILE){await shareExportBlob(blob,name);return '已打开系统分享，可选择已安装的应用。'}
 const file=new File([blob],name,{type:blob.type});
 if(share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'我的 OpenGym 周报'});return '已交给系统分享。'}catch(e){if(e.name==='AbortError')return '已取消分享，周报仍保留。';throw e}}
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 return share?'此浏览器未提供文件分享，已下载文件；可自行发到微信、QQ或抖音。':'已发起文件下载；iPhone 可保存到“文件”或长按预览图保存。';
}
export async function reportPoster(r,{layout='sport',palette='blue',headline='每一组都算数',includeWeight=false,includeFood=true}={}){
 if(document.fonts?.ready)await document.fonts.ready;
 const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1460;const c=canvas.getContext('2d');if(!c)throw Error('此浏览器无法生成图片，请使用TXT导出。');
 const acc=REPORT_PALETTES[palette]||REPORT_PALETTES.blue,dark=layout==='sport',bg=dark?'#101b25':'#f1f4f7',ink=dark?'#f7fafc':'#142434',muted=dark?'#adbac8':'#506474',card=dark?'#1b2b3b':'#ffffff';
 const text=(s,x,y,size=24,color=ink,bold=false)=>{c.fillStyle=color;c.font=`${bold?'700':'400'} ${size}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`;c.fillText(String(s),x,y)};
 const box=(x,y,w,h)=>{c.fillStyle=card;c.beginPath();if(c.roundRect)c.roundRect(x,y,w,h,22);else c.rect(x,y,w,h);c.fill()};
 const bars=(days,key,y,h=150)=>{const max=Math.max(1,...days.map(d=>Number(d[key])||0));days.forEach((d,i)=>{const x=96+i*104,v=d[key];text(v==null?'未记':v,x+27,y-12,20,muted);if(v!=null&&v>0){c.fillStyle=acc;c.fillRect(x,y+h-h*v/max,54,h*v/max)}else{c.fillStyle=muted;c.fillRect(x,y+h-2,54,2)}text(d.label,x+10,y+h+36,20,muted)})};
 if(layout==='editorial'){
  c.fillStyle=bg;c.fillRect(0,0,900,1460);text('OpenGym / PERSONAL WEEKLY',50,82,24,muted);text(headline,50,152,44,ink,true);text(`${r.start} 至 ${r.last}`,50,197,23,muted);
  box(50,236,800,240);text(r.workouts,80,408,142,acc,true);text('次训练记录',82,447,25,muted);text(`${r.sets} 个有效工作组`,440,322,34,ink,true);text(`${r.minutes} 分钟已记录时长`,440,379,26,muted);text(`${r.completedDays??0} 天完成了工作组`,440,430,26,muted);
  box(50,500,386,370);box(460,500,390,370);text('每天的工作组',78,552,25,ink,true);text(includeFood?'已记录热量 / kcal':'训练时长 / 分钟',484,552,24,ink,true);
  const mini=(key,x)=>{const max=Math.max(1,...r.days.map(d=>Number(d[key])||0));r.days.forEach((d,i)=>{const px=x+i*46,v=d[key],height=v==null?0:150*v/max;text(v==null?'·':v,px,612,16,muted);c.fillStyle=acc;if(height>0)c.fillRect(px,794-height,26,height);else{c.fillStyle=muted;c.fillRect(px,792,26,2)}text(d.label.slice(-1),px+4,832,18,muted)})};mini('sets',78);mini(includeFood?'calories':'minutes',488);
  box(50,896,800,340);text(includeWeight?'体重记录的轨迹':'这一周，值得留下',80,950,31,ink,true);
  if(includeWeight){const valid=r.days.filter(d=>d.weight!=null);if(valid.length){text(`${valid[0].weight} → ${valid.at(-1).weight} ${r.unit}`,80,1024,45,acc,true);text(`${r.weightDays} 个称重日，按当天最后一次记录`,80,1084,25,muted);text('短期波动不等于脂肪变化',80,1144,25,muted)}else text('本周暂无称重记录',80,1040,30,muted)}else{text(includeFood?`记下了 ${r.meals} 餐，覆盖 ${r.foodDays}/7 天`:'把记录留给自己，把节奏交给自己',80,1020,32,ink,true);text('不比较外观，也不根据空白推断运动量',80,1090,25,muted);text('下周，继续留下自己的训练足迹',80,1150,25,muted)}
  text('仅展示已保存记录；缺失不代表没有运动或没有进食。',50,1290,21,muted);text('工作组不含热身。训练容量不是运动消耗。',50,1330,21,muted);text('OpenGym · 为自己留下一份成长档案',50,1420,24,ink,true);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('图片生成失败，可改用TXT导出。')),'image/png'));
 }
 c.fillStyle=bg;c.fillRect(0,0,900,1460);c.fillStyle=acc;c.fillRect(50,52,48,7);text('OpenGym / 运动周刊',50,106,24,muted);text(headline,50,182,50,ink,true);text(`${r.start} 至 ${r.last}`,50,226,24,muted);
 box(50,264,800,160);[['有效工作组',r.sets,'组'],['训练记录',r.workouts,'次'],['实际训练日',r.completedDays??0,'天']].forEach(([label,v,unit],i)=>{const x=80+i*260;text(label,x,310,23,muted);text(`${v}`,x,378,54,ink,true);text(unit,x+120,378,22,muted)});
 box(50,446,800,284);text('每天完成的工作组',80,490,26,ink,true);bars(r.days,'sets',532,130);
 box(50,752,800,284);text(includeFood?'已记录热量 / kcal':'训练时长 / 分钟',80,796,26,ink,true);bars(r.days,includeFood?'calories':'minutes',838,130);
 box(50,1058,800,224);if(includeWeight){text('体重足迹',80,1104,26,ink,true);const valid=r.days.map((d,i)=>({...d,i})).filter(d=>d.weight!=null);if(valid.length){const lo=Math.min(...valid.map(d=>d.weight)),hi=Math.max(...valid.map(d=>d.weight)),Y=d=>1220-(d.weight-lo)/Math.max(.5,hi-lo)*65;c.strokeStyle=acc;c.lineWidth=4;c.beginPath();valid.forEach((d,i)=>{const x=110+d.i*105;i?c.lineTo(x,Y(d)):c.moveTo(x,Y(d))});c.stroke();valid.forEach(d=>{const x=110+d.i*105;c.fillStyle=acc;c.beginPath();c.arc(x,Y(d),5,0,Math.PI*2);c.fill();text(d.weight,x-24,Y(d)-15,20,ink);text(d.date.slice(5),x-26,1260,18,muted)})}else text('本周尚无体重记录',80,1180,26,muted)}else{text('本周留下的记录',80,1104,26,ink,true);text(`${r.minutes} 分钟训练 · ${r.sets} 个工作组`,80,1162,30,ink,true);text(includeFood?`饮食覆盖 ${r.foodDays}/7 天 · 共 ${r.meals} 餐`:'未包含饮食与体重数据',80,1212,26,muted)}
 text('仅展示已保存记录；空白不代表没有运动或没有进食。',50,1330,21,muted);text('工作组不含热身。训练容量不是运动消耗。',50,1368,21,muted);text('OpenGym · 为自己留下一份成长档案',50,1420,22,ink,true);
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('图片生成失败，可改用TXT导出。')),'image/png'));
}
