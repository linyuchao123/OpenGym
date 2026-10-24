// Read only the requested page and its rendering dependencies. SQL parameters never include
// user-supplied SQL. Compatibility serialization remains in api/lifestyle.js.
export async function feedSnapshot(repo,viewer,params){
 const own={};for(const kind of ['blocks','follows','bookmarks'])own[kind]=await repo.read('life',kind+':'+viewer)||[];
 const conditions=["p.scope='life'","p.id LIKE 'posts:%'","COALESCE(json_extract(p.body,'$.deleted'),0)=0",
 "NOT EXISTS(SELECT 1 FROM documents b,json_each(b.body) x WHERE b.scope='life' AND ((b.id=? AND x.value=json_extract(p.body,'$.uid')) OR (b.id='blocks:'||json_extract(p.body,'$.uid') AND x.value=?)))"],args=['blocks:'+viewer,viewer];
 const add=(sql,...values)=>{conditions.push(sql);args.push(...values)};
 if(params.get('author'))add("json_extract(p.body,'$.uid')=?",params.get('author'));
 if(params.get('following')==='1')add("json_extract(p.body,'$.uid') IN (SELECT value FROM json_each(?))",JSON.stringify(own.follows));
 if(params.get('saved')==='1')add("json_extract(p.body,'$.id') IN (SELECT value FROM json_each(?))",JSON.stringify(own.bookmarks));
 if(params.get('category'))add("json_extract(p.body,'$.category')=?",params.get('category'));
 if(params.get('tag'))add("EXISTS(SELECT 1 FROM json_each(p.body,'$.tags') WHERE value=?)",params.get('tag'));
 if(params.get('q'))add("instr(lower(COALESCE(json_extract(p.body,'$.text'),'')||' '||COALESCE(json_extract(p.body,'$.tags'),'')),lower(?))>0",params.get('q').slice(0,60));
 const total=await repo.db.prepare('SELECT COUNT(*) n FROM documents p WHERE '+conditions.join(' AND ')).bind(...args).first();
 if(params.get('post'))add("json_extract(p.body,'$.id')=?",params.get('post'));
 else if(params.get('before')){const [time,id='']=params.get('before').split(':');if(Number.isFinite(Number(time)))add("(json_extract(p.body,'$.createdAt')<? OR (json_extract(p.body,'$.createdAt')=? AND json_extract(p.body,'$.id')<?))",Number(time),Number(time),id)}
 const limit=Math.max(1,Math.min(20,Math.trunc(Number(params.get('limit'))||20))),rows=new Map();
 const page=await repo.db.prepare('SELECT p.id,p.body FROM documents p WHERE '+conditions.join(' AND ')+" ORDER BY json_extract(p.body,'$.createdAt') DESC,json_extract(p.body,'$.id') DESC LIMIT ?").bind(...args,limit+1).all();
 const ids=new Set(page.results.map(r=>r.id.slice(6))),posts=page.results.map(r=>JSON.parse(r.body));for(const r of page.results)rows.set(r.id,r.body);
 for(const kind of ['blocks','follows','bookmarks'])rows.set(kind+':'+viewer,JSON.stringify(own[kind]));
 const shares={},originalIds=[...new Set(posts.map(p=>p.repostOf).filter(Boolean))];
 const counters=await repo.db.prepare("SELECT json_extract(body,'$.repostOf') AS source,COUNT(*) n FROM documents WHERE scope='life' AND id LIKE 'posts:%' AND COALESCE(json_extract(body,'$.deleted'),0)=0 AND json_extract(body,'$.repostOf') IN (SELECT value FROM json_each(?)) GROUP BY source").bind(JSON.stringify([...ids])).all();for(const r of counters.results)shares[r.source]=r.n;for(const id of ids)shares[id]??=0;
 const readIds=async keys=>{const unique=[...new Set(keys)].filter(k=>!rows.has(k));for(let offset=0;offset<unique.length;offset+=80){const chunk=unique.slice(offset,offset+80),r=await repo.db.prepare("SELECT id,body FROM documents WHERE scope='life' AND id IN ("+chunk.map(()=>'?').join(',')+")").bind(...chunk).all();for(const item of r.results)rows.set(item.id,item.body)}};
 await readIds(originalIds.map(id=>'posts:'+id));for(const id of originalIds){const raw=rows.get('posts:'+id);if(raw)posts.push(JSON.parse(raw))}
 const authors=new Set(posts.flatMap(p=>[p.uid,...(p.comments||[]).map(c=>c.uid)]));
 await readIds([...authors].flatMap(id=>['people:','blocks:','follows:'].map(k=>k+id)));
 const media=new Set(posts.flatMap(p=>[...(p.media||[]),p.music?.assetId,p.poster].filter(Boolean)));await readIds([...media].map(id=>'assets:'+id));

 return {snapshot:{scope:'life',rows,recordScoped:true},feedIds:ids,feedTotal:Number(total.n),shareCounts:shares};
}
