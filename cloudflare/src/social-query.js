// Conversation/notification reads never load other people's private messages or meals.
export async function socialSnapshot(repo,viewer,path,q){
 const rows=new Map(),insert=r=>rows.set(r.id,r.body),postCounts={};
 const graph=await repo.db.prepare("SELECT id,body FROM documents WHERE scope='life' AND (id LIKE 'follows:%' OR id LIKE 'blocks:%')").all();graph.results.forEach(insert);
 let messageRows=[];
 if(path==='/api/life/messages'){
  const peer=q.get('with')||'',anchor=q.get('before')?await repo.read('life','messages:'+q.get('before')):null,owned=anchor&&((anchor.from===viewer&&anchor.to===peer)||(anchor.to===viewer&&anchor.from===peer));
  const after=owned?" AND (json_extract(body,'$.createdAt')<? OR (json_extract(body,'$.createdAt')=? AND json_extract(body,'$.id')<?))":'',args=[viewer,peer,peer,viewer,...(owned?[anchor.createdAt,anchor.createdAt,anchor.id]:[])];
  const page=await repo.db.prepare("SELECT id,body FROM documents WHERE scope='life' AND id LIKE 'messages:%' AND ((json_extract(body,'$.from')=? AND json_extract(body,'$.to')=?) OR (json_extract(body,'$.from')=? AND json_extract(body,'$.to')=?))"+after+" ORDER BY json_extract(body,'$.createdAt') DESC,json_extract(body,'$.id') DESC LIMIT 51").bind(...args).all();messageRows=page.results;if(owned)messageRows.push({id:'messages:'+anchor.id,body:JSON.stringify(anchor)});
 }else if(path==='/api/life/inbox'){
  const r=await repo.db.prepare("SELECT id,body FROM documents WHERE scope='life' AND id LIKE 'messages:%' AND (json_extract(body,'$.to')=? OR json_extract(body,'$.from')=?)").bind(viewer,viewer).all();messageRows=r.results;
 }else{
  const r=await repo.db.prepare("SELECT id,body FROM documents WHERE scope='life' AND id LIKE 'notifications:%' AND json_extract(body,'$.to')=?").bind(viewer).all();r.results.forEach(insert);
  const m=await repo.db.prepare("SELECT id,body FROM documents WHERE scope='life' AND id LIKE 'messages:%' AND json_extract(body,'$.to')=? ORDER BY json_extract(body,'$.createdAt') DESC,json_extract(body,'$.id') DESC LIMIT 1").bind(viewer).first();if(m)messageRows=[m];
 }
 messageRows.forEach(insert);
 const people=new Set([viewer,q.get('with')].filter(Boolean)),posts=new Set();for(const [id,raw] of rows){if(!id.startsWith('messages:')&&!id.startsWith('notifications:'))continue;const x=JSON.parse(raw);people.add(x.from);people.add(x.to);if(x.post||x.postId)posts.add(x.post||x.postId)}
 const fetchKeys=async keys=>{const list=[...new Set(keys)];for(let i=0;i<list.length;i+=80){const batch=list.slice(i,i+80);if(!batch.length)continue;const r=await repo.db.prepare("SELECT id,body FROM documents WHERE scope='life' AND id IN ("+batch.map(()=>'?').join(',')+")").bind(...batch).all();r.results.forEach(insert)}};
 await fetchKeys([...posts].map(id=>'posts:'+id));const assets=new Set();for(const id of posts){const raw=rows.get('posts:'+id);if(raw){const p=JSON.parse(raw);people.add(p.uid);(p.media||[]).forEach(id=>assets.add(id))}}
 // Profiles only: body values remain governed by publicPerson's allowlist downstream.
 await fetchKeys([...people].map(id=>'people:'+id));await fetchKeys([...assets].map(id=>'assets:'+id));
 const counts=await repo.db.prepare("SELECT json_extract(body,'$.uid') uid,COUNT(*) n FROM documents WHERE scope='life' AND id LIKE 'posts:%' AND COALESCE(json_extract(body,'$.deleted'),0)=0 AND json_extract(body,'$.uid') IN (SELECT value FROM json_each(?)) GROUP BY uid").bind(JSON.stringify([...people])).all();for(const r of counts.results)postCounts[r.uid]=r.n;
 return {snapshot:{scope:'life',rows,recordScoped:true},postCounts};
}
