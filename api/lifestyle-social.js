import {notify} from './lifestyle-extra.js';
import crypto from 'node:crypto';

// All queries are scoped to the authenticated member. Never expose nutrition or account fields.
export function socialRoutes({ wrap, getDB, commit, publicPerson, json, readBody, getMember,onMessage,postCounts,likeCounts,peoplePage }) {
  const fail = (res, error, status = 400) => json(res, status, { error });
  const query = req => new URL(req.url, 'http://localhost').searchParams;
  const blocked = (a,b) => (getDB().blocks[a] || []).includes(b) || (getDB().blocks[b] || []).includes(a);
  const following = (a,b) => (getDB().follows[a] || []).includes(b);
  const canChat = (a,b) => !blocked(a,b) && following(a,b) && following(b,a);
  const candidates = () => [...new Set([...Object.keys(getDB().people), ...Object.keys(getDB().follows), ...Object.values(getDB().follows).flat()])];
  const known = id => typeof id === 'string' && (getMember ? !!getMember(id) : candidates().includes(id));
  // A follow exists before its owner edits a lifestyle profile. Use the relationship graph
  // for both totals and rows, with identical account/block filters and deduplication.
  const related = (id, relation, viewer=id) => candidates().filter(other=>other!==id && known(other) && !blocked(id,other) && !blocked(viewer,other) && (relation==='following'?following(id,other):following(other,id)));
  const member = (id, viewer) => ({ ...publicPerson(id), following: following(viewer,id), followsYou: following(id,viewer),
    blocked: (getDB().blocks[viewer] || []).includes(id), canChat: canChat(viewer,id),
    followers: related(id,'followers',viewer).length, followingCount: related(id,'following',viewer).length, likesReceived:likeCounts?.[id]??getDB().posts.filter(p=>p.uid===id&&!p.deleted).reduce((n,p)=>n+(p.likes||[]).length,0), postCount:postCounts?.[id]??getDB().posts.filter(p=>p.uid===id&&!p.deleted).length });
  const participants = (m,a,b) => (m.from === a && m.to === b) || (m.from === b && m.to === a);
  const card = (id,viewer) => {
    const p=getDB().posts.find(p=>p.id===id&&!p.deleted&&!blocked(viewer,p.uid));
    return p ? {id:p.id,text:p.text,author:publicPerson(p.uid),media:(p.media||[]).slice(0,1),videoIds:(p.media||[]).filter(id=>getDB().assets[id]?.mime?.startsWith('video/'))} : null;
  };
  const messageFor = (m,viewer) => ({...m,kind:m.kind||'text',...(m.kind==='post'?{post:card(m.postId,viewer),postUnavailable:!card(m.postId,viewer)}:{})});
  return {
    'GET /api/life/people': wrap(async(req,res,u)=>{
      const q = query(req); const id = q.get('id');
      if (id) { if (!known(id)||(id!==u.id&&blocked(u.id,id))) return fail(res,'成员不存在或不可见。',404); return json(res,200,{person:member(id,u.id)}); }
      if(peoplePage)return json(res,200,{people:peoplePage.ids.map(id=>member(id,u.id)),total:peoplePage.total,more:peoplePage.more,next:peoplePage.next});
      const needle = (q.get('q') || '').trim().slice(0,40).toLocaleLowerCase();
      const page = Math.max(0,Math.min(10000,Number(q.get('page')) || 0));
      const relation=q.get('relation'),showBlocked=q.get('blocked')==='1';
      const source=!showBlocked&&['following','followers'].includes(relation)?related(u.id,relation):candidates();
      const list = source.filter(id=>id !== u.id && known(id) && (showBlocked ? (getDB().blocks[u.id] || []).includes(id) : !blocked(u.id,id)) && (!needle || publicPerson(id).nickname.toLocaleLowerCase().includes(needle))).sort();
      json(res,200,{people:(q.get('cursor')?list.filter(id=>id>q.get('cursor')).slice(0,30):list.slice(page*30,page*30+30)).map(id=>member(id,u.id)),total:list.length,more:(q.get('cursor')?list.filter(id=>id>q.get('cursor')).length>30:list.length>(page+1)*30),next:(q.get('cursor')?list.filter(id=>id>q.get('cursor')).slice(0,30):list.slice(page*30,page*30+30)).at(-1)||null});
    }),
    'POST /api/life/follow': wrap(async(req,res,u)=>{
      const body = await readBody(req); const id = body.id;
      if (!known(id) || id === u.id) return fail(res,'请选择其他站内成员。');
      if (blocked(u.id,id)) return fail(res,'已屏蔽，无法关注。',403);
      await commit(s=>{s.people[u.id]||={profile:{},meals:[]};s.people[u.id].profile.nickname||=u.name||'健身伙伴';if(body.following===true&&!(s.follows[u.id]||[]).includes(id))notify(s,{to:id,from:u.id,kind:'follow',key:`follow:${u.id}:${id}`});s.follows[u.id] = [...(s.follows[u.id] || []).filter(x=>x!==id),...(body.following === true ? [id] : [])];});
      json(res,200,{person:member(id,u.id)});
    }),
    'POST /api/life/block': wrap(async(req,res,u)=>{
      const {id,blocked:enabled} = await readBody(req);
      if (!known(id) || id === u.id) return fail(res,'请选择其他站内成员。');
      await commit(s=>{
        s.blocks[u.id] = [...(s.blocks[u.id] || []).filter(x=>x!==id),...(enabled === true ? [id] : [])];
        if (enabled === true) { s.follows[u.id] = (s.follows[u.id] || []).filter(x=>x!==id); s.follows[id] = (s.follows[id] || []).filter(x=>x!==u.id); }
      });
      json(res,200,{person:member(id,u.id)});
    }),
    'GET /api/life/inbox': wrap(async(req,res,u)=>{
      const messages = getDB().messages.filter(m=>m.from===u.id || m.to===u.id);
      const others = [...new Set(messages.map(m=>m.from===u.id?m.to:m.from))];
      const conversations = others.filter(id=>!blocked(u.id,id)).map(id=>{
        const rows = messages.filter(m=>participants(m,u.id,id));
        return {person:member(id,u.id),last:messageFor(rows.at(-1),u.id),unread:rows.filter(m=>m.to===u.id&&!m.readAt).length};
      }).sort((a,b)=>b.last.createdAt-a.last.createdAt);
      json(res,200,{conversations});
    }),
    'GET /api/life/messages': wrap(async(req,res,u)=>{
      const q = query(req); const id = q.get('with');
      if (!known(id) || id===u.id) return fail(res,'成员不存在。',404);
      if (blocked(u.id,id)) return fail(res,'无法查看此会话。',403);
      const beforeId = q.get('before'); const all = getDB().messages.filter(m=>participants(m,u.id,id));
      let end = beforeId ? all.findIndex(m=>m.id===beforeId) : all.length;
      if (end<0) return fail(res,'无效的分页位置。');
      const rows = all.slice(Math.max(0,end-50),end);
      json(res,200,{person:member(id,u.id),messages:rows.map(m=>messageFor(m,u.id)),next:end>50?rows[0].id:null});
    }),
    'POST /api/life/message': wrap(async(req,res,u)=>{
      const body = await readBody(req); const id = body.to;
      if (!known(id) || id===u.id) return fail(res,'请选择其他站内成员。');
      if (!canChat(u.id,id)) return fail(res,'双方互相关注后才能私聊；屏蔽后不能发送。',403);
      const text = body.kind==='post'?'':typeof body.text === 'string' ? body.text.trim() : '';
      const kind=body.kind||'text',postId=kind==='post'?body.postId:null;
      if(!['text','post'].includes(kind))return fail(res,'不支持的消息类型。');
      if(kind==='text'&&(!text||text.length>2000))return fail(res,'私信请输入 1 至 2000 个字。');
      if(kind==='post'&&(!card(postId,u.id)||!card(postId,id)))return fail(res,'这条动态已删除或对会话成员不可见。',404);
      const db = getDB();
      // Client-generated retry key makes network retries safe without duplicating a message.
      const key = typeof body.clientId === 'string' && /^[\w-]{1,80}$/.test(body.clientId) ? body.clientId : crypto.randomUUID();
      const old = db.messages.find(m=>m.from===u.id&&m.clientId===key);
      if (old) { if (old.to!==id || old.text!==text || (old.kind||'text')!==kind || (old.postId||null)!==postId) return fail(res,'重复请求内容不一致。',409); return json(res,200,{message:messageFor(old,u.id)}); }
      if (db.messages.filter(m=>m.from===u.id&&m.createdAt>Date.now()-60000).length>=30) return fail(res,'发送太频繁，请稍后再试。',429);
      if (db.messages.filter(m=>m.from===u.id).length>=30000) return fail(res,'私信存储已达上限。',413);
      const message = {id:crypto.randomUUID(),clientId:key,from:u.id,to:id,text,kind,...(postId?{postId}:{}),createdAt:Date.now(),readAt:null};
      await commit(s=>{s.messages.push(message);notify(s,{to:id,from:u.id,kind:'message'})}); if(onMessage)await onMessage(message).catch(()=>{}); json(res,200,{message:messageFor(message,u.id)});
    }),
    'POST /api/life/messages/read': wrap(async(req,res,u)=>{
      const {with:id,through} = await readBody(req);
      if (!known(id) || blocked(u.id,id)) return fail(res,'会话不可用。',403);
      const boundary=getDB().messages.findIndex(m=>m.id===through&&participants(m,u.id,id));
      if(boundary<0)return fail(res,'请选择已加载的消息。');
      await commit(s=>{s.messages.forEach((m,i)=>{if(i<=boundary&&m.from===id&&m.to===u.id&&!m.readAt)m.readAt=Date.now();});const throughAt=s.messages[boundary].createdAt;(s.notifications||[]).forEach(n=>{if(n.to===u.id&&n.from===id&&n.kind==='message'&&n.createdAt<=throughAt)n.readAt=Date.now()})});
      json(res,200,{ok:true});
    }),
  };
}
