import crypto from 'node:crypto';
import {notify} from './lifestyle-extra.js';
// Original procedural instrumentals; no third-party samples or recordings.
export const musicCatalogue=[
 {id:'momentum',title:'向前一步',artist:'openGym 原创',style:'力量 电子 节拍',duration:24},
 {id:'morning',title:'清晨出发',artist:'openGym 原创',style:'轻快 日常 饮食',duration:24},
 {id:'breathe',title:'慢慢呼吸',artist:'openGym 原创',style:'舒缓 拉伸 恢复',duration:24}
].map(t=>({...t,url:'/music/'+t.id+'.mp3',license:'本站原创器乐，可用于本站作品配乐',source:'/music/NOTICE.txt'}));
const clamp=(n,min,max,d)=>Number.isFinite(Number(n))?Math.min(max,Math.max(min,Number(n))):d;
export function sanitizePresentation(b,uid,db){
 const out={};
 if(b.music){const m=b.music,track=musicCatalogue.find(t=>t.id===m.trackId),asset=m.assetId&&db.assets[m.assetId];
  if(!track&&(!asset||asset.owner!==uid||asset.mime!=='audio/mpeg'))throw new Error('请选择有效的曲目或本人上传的 MP3。');
  const start=clamp(m.start,0,track?track.duration-1:59,0),duration=clamp(m.duration,1,track?track.duration-start:60-start,15);
  out.music={...(track?{trackId:track.id,title:track.title,artist:track.artist}:{assetId:m.assetId,title:String(m.title||'我的配乐').slice(0,60),artist:String(m.artist||'用户提供').trim().slice(0,60),...(typeof m.sourceUrl==='string'&&/^https:\/\//i.test(m.sourceUrl)&&m.sourceUrl.length<=500?{sourceUrl:m.sourceUrl}:{}),sourceLabel:'本人上传'}),start,duration,volume:clamp(m.volume,0,1,.6),originalVolume:clamp(m.originalVolume,0,1,.5)};
 }
 if(b.effects){const e=b.effects;out.effects={filter:['none','mono','warm','cool'].includes(e.filter)?e.filter:'none',brightness:clamp(e.brightness,.5,1.5,1),sticker:String(e.sticker||'').trim().slice(0,80),stickerX:clamp(e.stickerX,5,95,50),stickerY:clamp(e.stickerY,5,90,25),autoplay:e.autoplay===true};}
 if(b.cover&&(b.media||[]).includes(b.cover))out.cover=b.cover;
 if(b.poster){const a=db.assets[b.poster];if(!a||a.owner!==uid||!a.mime.startsWith('image/'))throw Error('视频封面必须是本人上传的图片。');out.poster=b.poster}
 return out;
}
export function creatorRoutes({wrap,getDB,commit,publicPerson,serialize,json,readBody,isAdmin}){
 const fail=(r,e,s=400)=>json(r,s,{error:e});
 const blocked=(a,b)=>(getDB().blocks[a]||[]).includes(b)||(getDB().blocks[b]||[]).includes(a);
 const post=(id,u)=>getDB().posts.find(p=>p.id===id&&!p.deleted&&!blocked(u.id,p.uid));
 const visible=(c,u)=>!blocked(u.id,c.uid);
 const pack=(c,u,p)=>({id:c.id,uid:c.uid,text:c.deleted?'评论已删除':c.text,deleted:!!c.deleted,createdAt:c.createdAt,parentId:c.parentId||null,replyTo:c.replyTo||null,replyAuthor:c.replyTo?publicPerson(p.comments.find(x=>x.id===c.replyTo)?.uid):null,author:publicPerson(c.uid),liked:!c.deleted&&(c.likes||[]).includes(u.id),likeCount:c.deleted?0:(c.likes||[]).length,replyCount:p.comments.filter(x=>x.parentId===c.id&&visible(x,u)).length,canDelete:!c.deleted&&(c.uid===u.id||isAdmin(u))});
 return {
 'GET /api/life/music':wrap(async(req,res)=>{const q=new URL(req.url,'http://local').searchParams.get('q')?.trim().toLowerCase()||'';json(res,200,{tracks:musicCatalogue.filter(t=>(t.title+' '+t.artist+' '+t.style).toLowerCase().includes(q))})}),
 'GET /api/life/comments':wrap(async(req,res,u)=>{const q=new URL(req.url,'http://local').searchParams,p=post(q.get('post'),u);if(!p)return fail(res,'动态已删除或不可见。',404);
 const parent=q.get('parent')||null,offset=Math.max(0,Number(q.get('offset'))||0),all=p.comments.filter(c=>(c.parentId||null)===parent&&visible(c,u)&&(!c.deleted||p.comments.some(r=>r.parentId===c.id&&visible(r,u))));
 all.sort(q.get('sort')==='hot'?(a,b)=>(b.likes||[]).length-(a.likes||[]).length||b.createdAt-a.createdAt:(a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
 json(res,200,{items:all.slice(offset,offset+20).map(c=>pack(c,u,p)),next:offset+20<all.length?offset+20:null,total:p.comments.filter(c=>!c.deleted&&visible(c,u)).length});}),
 'POST /api/life/comment':wrap(async(req,res,u)=>{const b=await readBody(req),p=post(b.postId,u);if(!p)return fail(res,'动态已删除或不可见。',404);
 const text=typeof b.text==='string'?b.text.trim().slice(0,500):'',clientId=typeof b.clientId==='string'&&/^[\w-]{1,80}$/.test(b.clientId)?b.clientId:null;
 if(!text||!clientId)return fail(res,'请输入评论并提供重试标识。');
 const duplicate=p.comments.find(c=>c.uid===u.id&&c.clientId===clientId);if(duplicate){if(duplicate.text!==text||duplicate.replyTo!==(b.replyTo||null))return fail(res,'重试内容已变更，请重新发送。',409);return json(res,200,{comment:pack(duplicate,u,p),post:serialize(p,u.id)})}
 const target=b.replyTo?p.comments.find(c=>c.id===b.replyTo&&!c.deleted&&visible(c,u)):null;if(b.replyTo&&!target)return fail(res,'被回复的评论已删除或不可见。',404);
 if(p.comments.length>=300)return fail(res,'这条动态的评论已达上限。');
 const c={id:crypto.randomUUID(),uid:u.id,text,clientId,parentId:target?(target.parentId||target.id):null,replyTo:target?.id||null,likes:[],createdAt:Date.now()};
 await commit(s=>{s.posts.find(x=>x.id===p.id).comments.push(c);s.people[u.id]||={profile:{},meals:[]};s.people[u.id].profile.nickname||=u.name||'健身伙伴';notify(s,{to:target?.uid||p.uid,from:u.id,kind:target?'reply':'comment',post:p.id,key:'comment:'+c.id});});const latest=post(p.id,u);json(res,200,{comment:pack(c,u,latest),post:serialize(latest,u.id,true)});
 }),
 'POST /api/life/comment/react':wrap(async(req,res,u)=>{const b=await readBody(req),p=post(b.postId,u),c=p?.comments.find(c=>c.id===b.id&&visible(c,u));if(!c||c.deleted)return fail(res,'评论已删除或不可见。',404);if(!['like','delete'].includes(b.action))return fail(res,'未知操作。');if(b.action==='delete'&&c.uid!==u.id&&!isAdmin(u))return fail(res,'不能删除他人的评论。',403);
 await commit(s=>{const x=s.posts.find(x=>x.id===p.id).comments.find(x=>x.id===c.id);if(b.action==='delete'){x.deleted=true;x.text='';x.likes=[]}else x.likes=[...(x.likes||[]).filter(id=>id!==u.id),...(b.liked===true?[u.id]:[])];});const latest=post(p.id,u);json(res,200,{comment:pack(latest.comments.find(x=>x.id===c.id),u,latest),post:serialize(latest,u.id,true)});
 })};
}
