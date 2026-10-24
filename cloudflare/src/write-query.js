// Only these writes use record-level concurrency. Relationship, account and challenge writes
// keep their conservative scope transaction until their cross-record invariants are migrated.
export const recordWritePaths=new Set(['POST /api/life/post','POST /api/life/react','POST /api/life/comment','POST /api/life/comment/react']);
export async function writeSnapshot(repo,viewer,key,body){
 const rows=new Map(),guards=new Set(),readonlyIds=new Set(),put=r=>rows.set(r.id,r.body);
 const readKeys=async keys=>{const ids=[...new Set(keys)].filter(id=>!rows.has(id));for(let i=0;i<ids.length;i+=80){const chunk=ids.slice(i,i+80);if(!chunk.length)continue;const r=await repo.db.prepare("SELECT id,body FROM documents WHERE scope='life' AND id IN ("+chunk.map(()=>'?').join(',')+")").bind(...chunk).all();r.results.forEach(put)}};
 const target=key==='POST /api/life/post'?body.repostOf:key==='POST /api/life/react'?body.id:body.postId;
 if(typeof target==='string')await readKeys(['posts:'+target]);
 let posts=[...rows].filter(([id])=>id.startsWith('posts:')).map(([,raw])=>JSON.parse(raw));
 await readKeys(posts.filter(p=>p.repostOf).map(p=>'posts:'+p.repostOf));
 posts=[...rows].filter(([id])=>id.startsWith('posts:')).map(([,raw])=>JSON.parse(raw));
 await readKeys(['bookmarks:'+viewer]);
 for(const p of posts)guards.add('posts:'+p.id);
 const recipients=new Set(posts.map(p=>p.uid));for(const p of posts){const c=(p.comments||[]).find(c=>c.id===body.replyTo);if(c)recipients.add(c.uid)}
 const fullPeople=new Set([viewer,...recipients]),publicPeople=new Set(posts.flatMap(p=>(p.comments||[]).map(c=>c.uid)));
 await readKeys([...fullPeople].map(id=>'people:'+id));
 // Rendering-only profile projections cannot be written back over private nutrition documents.
 const projected=[...publicPeople].filter(id=>!fullPeople.has(id)).map(id=>'people:'+id);for(let i=0;i<projected.length;i+=80){const chunk=projected.slice(i,i+80),r=await repo.db.prepare("SELECT id,json_object('profile',json_extract(body,'$.profile')) body FROM documents WHERE scope='life' AND id IN ("+chunk.map(()=>'?').join(',')+")").bind(...chunk).all();for(const item of r.results){put(item);readonlyIds.add(item.id)}}

 const blockIds=new Set([viewer,...recipients,...publicPeople]);await readKeys([...blockIds].flatMap(id=>['blocks:'+id,'follows:'+id]));
 for(const id of [viewer,...recipients]){guards.add('blocks:'+id);guards.add('follows:'+id)}
 const media=new Set([...(Array.isArray(body.media)?body.media:[]),body.poster,body.music?.assetId,...posts.flatMap(p=>p.media||[])].filter(id=>typeof id==='string'));
 await readKeys([...media].map(id=>'assets:'+id));for(const id of media)guards.add('assets:'+id);
 for(const id of recipients){const r=await repo.db.prepare("SELECT id,body FROM documents WHERE scope='life' AND id LIKE 'notifications:%' AND json_extract(body,'$.to')=?").bind(id).all();r.results.forEach(put)}
 if(key==='POST /api/life/post'){
  // Per-member publishVersion is changed by the business transaction; it serializes this quota.
  guards.add('people:'+viewer);
  const recent=await repo.db.prepare("SELECT id,json_object('id',json_extract(body,'$.id'),'uid',json_extract(body,'$.uid'),'createdAt',json_extract(body,'$.createdAt')) body FROM documents WHERE scope='life' AND id LIKE 'posts:%' AND json_extract(body,'$.uid')=? AND json_extract(body,'$.createdAt')>?").bind(viewer,Date.now()-60000).all();for(const r of recent.results)if(!rows.has(r.id)){put(r);readonlyIds.add(r.id)}
 }
 // Count reposts separately without loading each repost's media/comments.
 const shareCounts={};for(const p of posts)shareCounts[p.id]=Number((await repo.db.prepare("SELECT COUNT(*) n FROM documents WHERE scope='life' AND id LIKE 'posts:%' AND COALESCE(json_extract(body,'$.deleted'),0)=0 AND json_extract(body,'$.repostOf')=?").bind(p.id).first()).n);
 return {snapshot:{scope:'life',rows,recordScoped:true,guards,readonlyIds},shareCounts};
}
