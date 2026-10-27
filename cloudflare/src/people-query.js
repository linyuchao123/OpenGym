export async function peopleSnapshot(repo,viewer,q){
 const rows=new Map(),graph=await repo.db.prepare("SELECT id,body FROM documents WHERE scope='life' AND (id LIKE 'follows:%' OR id LIKE 'blocks:%')").all();for(const r of graph.results)rows.set(r.id,r.body);
 const wanted=q.get('id'),conditions=["u.scope='auth'","u.id LIKE 'user:%'","COALESCE(json_extract(u.body,'$.disabled'),0)=0"],args=[];
 const add=(sql,...values)=>{conditions.push(sql);args.push(...values)};
 if(wanted)add("u.id=?",'user:'+wanted);
 else{
  add('u.id<>?','user:'+viewer);
  const ownBlocked=q.get('blocked')==='1',candidate="substr(u.id,6)";
  add((ownBlocked?'':'NOT ')+"EXISTS(SELECT 1 FROM documents b,json_each(b.body) x WHERE b.scope='life' AND b.id=? AND x.value="+candidate+")",'blocks:'+viewer);
  if(!ownBlocked)add("NOT EXISTS(SELECT 1 FROM documents b,json_each(b.body) x WHERE b.scope='life' AND b.id='blocks:'||"+candidate+" AND x.value=?)",viewer);
  const relation=q.get('relation');if(!ownBlocked&&relation==='following')add("EXISTS(SELECT 1 FROM documents f,json_each(f.body) x WHERE f.scope='life' AND f.id=? AND x.value="+candidate+")",'follows:'+viewer);
  if(!ownBlocked&&relation==='followers')add("EXISTS(SELECT 1 FROM documents f,json_each(f.body) x WHERE f.scope='life' AND f.id='follows:'||"+candidate+" AND x.value=?)",viewer);
  if(q.get('q')?.trim())add("instr(lower(COALESCE(NULLIF(json_extract(p.body,'$.profile.nickname'),''),json_extract(u.body,'$.name'),'')),lower(?))>0",q.get('q').trim().slice(0,40));
 }
 const base=" FROM documents u LEFT JOIN documents p ON p.scope='life' AND p.id='people:'||substr(u.id,6) WHERE ",total=await repo.db.prepare('SELECT COUNT(*) n'+base+conditions.join(' AND ')).bind(...args).first();
 if(!wanted&&q.get('cursor'))add('substr(u.id,6)>?',q.get('cursor'));
 const offset=wanted||q.get('cursor')?0:Math.max(0,Math.min(10000,Math.trunc(Number(q.get('page'))||0)))*30;
 const r=await repo.db.prepare("SELECT substr(u.id,6) uid,json_object('profile',COALESCE(json_extract(p.body,'$.profile'),json('{}'))) body"+base+conditions.join(' AND ')+" ORDER BY u.id LIMIT ? OFFSET ?").bind(...args,wanted?1:31,offset).all();
 for(const p of r.results)rows.set('people:'+p.uid,p.body);
 const ids=r.results.slice(0,wanted?1:30).map(p=>p.uid),postCounts={},likeCounts={},counts=await repo.db.prepare("SELECT json_extract(body,'$.uid') uid,COUNT(*) n,SUM(COALESCE(json_array_length(body,'$.likes'),0)) likes FROM documents WHERE scope='life' AND id LIKE 'posts:%' AND COALESCE(json_extract(body,'$.deleted'),0)=0 AND json_extract(body,'$.uid') IN (SELECT value FROM json_each(?)) GROUP BY uid").bind(JSON.stringify(ids)).all();for(const c of counts.results){postCounts[c.uid]=c.n;likeCounts[c.uid]=c.likes||0;}
 return {snapshot:{scope:'life',recordScoped:true,rows},postCounts,likeCounts,peoplePage:wanted?null:{ids,total:Number(total.n),more:r.results.length>30,next:r.results.length>30?ids.at(-1):null}};
}
