import UnreadBadge from '../components/UnreadBadge.jsx'
import PostComposer from '../components/PostComposer.jsx'
import CommentPanel from '../components/CommentPanel.jsx'
import {createPortal} from 'react-dom'
import {useParams, useLocation, Navigate} from 'react-router-dom'
import PostMedia from '../components/PostMedia.jsx'
import {VideoAttachment,VideoCover} from '../components/PostMedia.jsx'
import CommunityImage from '../components/CommunityImage.jsx'
import {feeds,feedPreferences,clearCommunity,loadCommunityImage,onCommunityClear} from '../lib/community-cache.js'
import {useOriginNavigate as useNavigate, ReturnButton, useReturn, useModalHistory} from '../lib/route-origin.jsx'
import { useEffect, useRef, useState } from 'react'
import {  useSearchParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { assetURL, imageBlob, uploadLifestyle, useLifestyle } from '../lib/lifestyle.js'
import { useStore } from '../store/useStore.js'
import Avatar from '../components/Avatar.jsx'
import Icon from '../components/Icon.jsx'

function Attachment({id,video=false}){return video?<VideoAttachment id={id}/>:<CommunityImage id={id}/>}
export function PostFeed({ mine = false,authorId = null,grid=false,saved=false,viewer=false,startPost=null,sourceKey=null }) {
  const user = useStore(s=>s.user)
  const nav = useNavigate()
  const [query] = useSearchParams()
  const selected = startPost&&!authorId&&!saved ? startPost : mine || authorId ? null : query.get('post')
  const preferred=!mine&&!authorId&&!grid&&!viewer?feedPreferences.get(user?.id)||{}:{}
  const [category,setCategory]=useState(preferred.category||''),[search,setSearch]=useState(preferred.search||''),[searchQuery,setSearchQuery]=useState(preferred.search||''),[postCategory,setPostCategory]=useState('general'),[tags,setTags]=useState('')
  const tag=query.get('tag')||''
  const [scope,setScope]=useState(saved?'saved':preferred.scope||'all')
  const [view,setView]=useState(viewer?'swipe':authorId||mine?'list':preferred.view||'swipe')
  const initialKey=[user?.id,mine,selected,saved?'saved':preferred.scope||'all',authorId,preferred.category||'',preferred.search||'',tag].join('|')
  const [posts,setPosts] = useState(()=>(feeds.get(initialKey)||feeds.get(sourceKey))?.posts||[])
  const [next,setNext] = useState(()=>(feeds.get(initialKey)||feeds.get(sourceKey))?.next||null)
  const feedRef=useRef(null),didSelect=useRef(false)
  const [menu,setMenu]=useState(false),[visibleIndex,setVisibleIndex]=useState(0)
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [composer,setComposer] = useState(false)
  const [revision,setRevision] = useState(0)
  const [notice,setNotice] = useState('')

  const feedIdentity = useRef('')
  const loadingMore = useRef(false)
  const currentOwner = user?.id
  const endpoint = (before='') => '/api/life/feed?' + new URLSearchParams({compact:'1',limit:grid?'18':'8', ...(authorId?{author:authorId}:mine?{author:user.id}:{}),...((scope==='saved'||saved)?{saved:'1'}:scope==='following'?{following:'1'}:{}),...(category?{category}:{}),...(searchQuery?{q:searchQuery}:{}),...(tag?{tag}:{}),...(selected?{post:selected}:{}),...(before?{before}:{} ) })
  useEffect(()=>{
    if (!user) {setPosts([]);return}
    let active=true;setLoading(true);setError('')
    const identity = [currentOwner,mine,selected,scope,authorId,category,searchQuery,tag].join('|')
    if (feedIdentity.current !== identity) { const old=feeds.get(identity)||feeds.get(sourceKey);if(old&&!feeds.has(identity))feeds.set(identity,{...old,scroll:0});setPosts(old?.posts||[]); setNext(old?.next||null); feedIdentity.current = identity }
    api(endpoint()).then(async data=>{if(viewer&&startPost&&!data.posts.some(p=>p.id===startPost)){const chosen=await api('/api/life/feed?post='+encodeURIComponent(startPost));if(!chosen.posts.length||(authorId&&chosen.posts[0].uid!==authorId))throw new Error('这条动态已删除或暂不可见');if(saved&&!chosen.posts[0].saved)throw new Error('这条动态已取消收藏');const cached=feeds.get(identity)||feeds.get(sourceKey);data=cached?.posts?.some(p=>p.id===startPost)?{...data,posts:[...data.posts,...chosen.posts]}:{...data,posts:chosen.posts,next:authorId||saved?`${chosen.posts[0].createdAt}:${chosen.posts[0].id}`:null}}if(active){const old=feeds.get(identity);const merged=(old?.next||old?.posts?.length>20)?{...data,posts:[...data.posts,...old.posts.filter(p=>!(old.firstIds||[]).includes(p.id)&&!data.posts.some(x=>x.id===p.id))],next:old.next}:data;if(viewer)merged.posts.sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id));setPosts(merged.posts);setNext(merged.next);feeds.set(identity,{...merged,firstIds:data.posts.map(p=>p.id),scroll:old?.scroll||0});requestAnimationFrame(()=>{const el=feedRef.current;if(el){const chosen=!didSelect.current&&startPost&&document.getElementById('post-'+startPost);el.scrollTop=chosen?chosen.offsetTop-el.offsetTop:old?.scroll||0;setVisibleIndex(Math.round(el.scrollTop/(el.clientHeight||1)));if(chosen)didSelect.current=true}})}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[currentOwner,mine,selected,scope,revision,authorId,category,searchQuery,tag])
  useEffect(()=>onCommunityClear(()=>{setPosts([]);setNext(null);setRevision(v=>v+1)}),[])
  useEffect(()=>{const el=feedRef.current;if(el)el.scrollTop=feeds.get(feedIdentity.current)?.scroll||0},[])
  useEffect(()=>{if(!grid)posts.slice(visibleIndex+1,visibleIndex+3).forEach(p=>{const id=p.media?.[0];if(id&&!p.videoIds?.includes(id))loadCommunityImage(id,assetURL(id)).catch(()=>{})})},[posts,grid,visibleIndex])
  useEffect(()=>{if(!mine&&!authorId&&!grid&&!viewer)feedPreferences.set(user?.id,{scope,view,category,search:searchQuery})},[scope,view,category,searchQuery,user?.id])
  const refresh=()=>setRevision(v=>v+1)
  const updatePost=patch=>{if(!patch||useStore.getState().user?.id!==currentOwner)return;for(const entry of feeds.values()){if(entry.posts)entry.posts=entry.posts.map(p=>p.id===patch.id?{...p,...patch}:p)}setPosts(old=>old.map(p=>p.id===patch.id?{...p,...patch}:p))}

  const loadMore=async()=>{if(loadingMore.current||!next)return;loadingMore.current=true;const identity=feedIdentity.current;setLoading(true);try{const data=await api(endpoint(next));if(identity!==feedIdentity.current)return;setPosts(old=>{const posts=[...old,...data.posts.filter(p=>!old.some(x=>x.id===p.id))];feeds.set(identity,{...feeds.get(identity),posts,next:data.next});return posts});setNext(data.next)}catch(e){setError(e.message)}finally{loadingMore.current=false;if(identity===feedIdentity.current)setLoading(false)}}
  if(!user)return <section className="card life-empty"><Icon name="people"/><h2>和朋友一起，练得更久一点</h2><p>社区只对登录的成员开放。请登录自己的账号，邀请朋友后即可分享健身日常。</p><button className="life-primary" onClick={()=>nav('/settings/account')}>登录 / 创建账号</button><p className="small muted">访客模式不会发布或模拟其他用户的动态。</p></section>
  return <>
    {!mine&&!authorId&&!grid&&!viewer&&view==='list'&&<div className="card life-community-intro"><div><span className="life-eyebrow">邀请制好友社区</span><h2>分享今天的小小进步</h2><p>一张训练照、一顿认真吃的饭，或者一段想说的话。</p></div><button className="life-primary" onClick={()=>{setComposer(true);setError('')}}><Icon name="plus"/>发布日常</button></div>}
    {!mine&&!selected&&!authorId&&!grid&&!viewer&&<div className="community-toolbar"><div className="community-tabs">{[['all','发现'],['following','关注']].map(([key,label])=><button key={key} aria-pressed={scope===key} className={scope===key?'on':''} onClick={()=>setScope(key)}>{label}</button>)}</div><button className="life-icon" aria-label="搜索与菜单" onClick={()=>setMenu(v=>!v)}><Icon name="magnifier"/></button><button className="life-icon" aria-label="消息中心" onClick={()=>nav('/notifications')}><Icon name="message"/><UnreadBadge/></button><button className="life-icon" aria-label="发布日常" onClick={()=>{setComposer(true);setError('')}}><Icon name="plus"/></button></div>}
    {menu&&<div className="card community-menu"><button className="life-link" onClick={()=>setView(v=>v==='swipe'?'list':'swipe')}>{view==='swipe'?'切换列表浏览':'切换沉浸浏览'}</button><button className="life-link" onClick={()=>nav('/members')}>寻找伙伴</button><button className="life-link" onClick={()=>nav('/challenges')}>好友挑战</button><form className="life-search" onSubmit={e=>{e.preventDefault();setSearchQuery(search);setMenu(false)}}><input aria-label="搜索动态" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索动态或话题"/><button>搜索</button></form><select aria-label="动态分类" value={category} onChange={e=>{setCategory(e.target.value);setMenu(false)}}>{Object.entries({'':'全部分类',workout:'训练打卡',nutrition:'饮食',progress:'进步记录',general:'日常'}).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></div>}
    {view==='list'&&!grid&&!viewer&&<div className="life-section-head"><h2>{mine?'我的动态':authorId?'TA 的动态':selected?'这条动态':scope==='following'?'关注的伙伴':'发现健身日常'}</h2><button className="life-link" onClick={refresh} disabled={loading}>刷新</button></div>}
    {notice&&<p className="life-notice" role="status">{notice}</p>}
    {error&&<p className="life-error" role="alert">{error}</p>}
    {!posts.length&&!loading&&!error&&<section className="card life-empty"><Icon name={saved?'star':'message'}/><h3>{saved?'还没有收藏':authorId?'还没有作品':mine?'你的第一条健身日常，值得留下来':'这里还很安静'}</h3><p>{saved?'在社区收藏喜欢的日常，回来就能找到。':authorId?'这位伙伴还没有发布日常。':mine?'发布的文字、照片和视频都会显示在这里。':'发布第一条动态，邀请朋友一起打卡。'}</p><button className="life-secondary" onClick={()=>mine||(!authorId&&!saved)?setComposer(true):nav('/community')}>{mine||(!authorId&&!saved)?'写一条日常':'去社区看看'}</button></section>}
    <div ref={feedRef} className={grid?'works-grid':view==='swipe'?'immersive-feed':'community-list'} aria-label={grid?'作品网格':'健身日常信息流'} tabIndex={0} onScroll={e=>{const el=e.currentTarget;const old=feeds.get(feedIdentity.current);if(old)old.scroll=el.scrollTop;if(view==='swipe'&&!grid){const index=Math.round(el.scrollTop/el.clientHeight);setVisibleIndex(index);posts.slice(index+1,index+3).forEach(p=>{const id=p.media?.[0];if(id&&!p.videoIds?.includes(id))loadCommunityImage(id,assetURL(id)).catch(()=>{})});if(el.scrollTop+el.clientHeight>=el.scrollHeight-160&&!loading&&next)loadMore()}}}>
     {!posts.length&&loading&&!grid&&<div className="community-loading" role="status">正在准备伙伴的日常…</div>}
     {posts.map((post,i)=>grid?<button className="work-cover" key={post.id} onClick={()=>nav('/community/post/'+encodeURIComponent(post.id)+(authorId||mine?'?author='+encodeURIComponent(authorId||user.id):saved?'?saved=1':''),{state:{workSource:feedIdentity.current}})}>{(post.cover||post.media?.[0])?(post.videoIds?.includes(post.cover||post.media[0])?<VideoCover id={post.cover||post.media[0]} posterId={post.poster}/>:<CommunityImage id={post.cover||post.media[0]} priority={i<3}/>):<span className="text-cover">{post.text||'分享的健身日常'}</span>}<span className="work-caption">{post.text||'健身日常'}</span><span className="work-likes"><Icon name="heart"/> {post.likeCount||0}</span></button>:view==='swipe'&&Math.abs(i-visibleIndex)>2?<article className="immersive-post post-placeholder" id={'post-'+post.id} key={post.id} aria-hidden="true"/>:<PostCard key={post.id} post={post} user={user} onChange={refresh} onUpdate={updatePost} onNotice={setNotice} immersive={view==='swipe'} priority={i===visibleIndex}/>)}
    </div>
    {loading&&<p className="life-notice">正在加载动态…</p>}{next&&<button className="life-secondary" disabled={loading} onClick={loadMore}>加载更多</button>}
    {composer&&<PostComposer key={user.id} user={user} onClose={()=>setComposer(false)} onPublished={()=>{setNotice('日常已发布');refresh()}}/>}
  </>
}
export function PostCard({post,user,onChange,onUpdate,onNotice,immersive=false,priority=false}) {
  const nav=useNavigate()
  const [comments,setComments]=useState(false)
  const [more,setMore]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [sharing,setSharing]=useState(false)
  const shareRetry=useRef(null)
  const [deleting,setDeleting]=useState(false)
  const [shareTo,setShareTo]=useState(null),[peers,setPeers]=useState([])
  useModalHistory(comments||sharing,()=>{setComments(false);setSharing(false);setShareTo(null)})
  const original=post.original
  const apply=patch=>onUpdate?onUpdate({...post,...patch}):onChange()
  const doAction=async body=>{setBusy(true);setError('');const previous=post;if(body.action==='like')apply({liked:body.liked,likeCount:post.likeCount+(body.liked?1:-1)});try{const d=await api('/api/life/react',{method:'POST',body:JSON.stringify({id:post.id,...body})});if(body.action==='delete'){clearCommunity();onChange()}else if(d.post)apply(d.post)}catch(e){if(body.action==='like')apply({...previous,liked:!!previous.liked,likeCount:previous.likeCount||0});setError(e.message)}finally{setBusy(false)}}
  const repost=async()=>{setBusy(true);try{await api('/api/life/post',{method:'POST',body:JSON.stringify({repostOf:original?.id||post.id})});setSharing(false);onNotice('已转发到社区，也会出现在「我的动态」。');onChange()}catch(e){setError(e.message)}finally{setBusy(false)}}
  const link=window.location.href.split('#')[0]+'#/community?post='+encodeURIComponent(post.id)
  const share=async()=>{try{if(navigator.share)await navigator.share({title:'好友的健身日常',url:link});else{await navigator.clipboard.writeText(link);onNotice('链接已复制，朋友登录后才能查看。')}}catch(e){if(e.name!=='AbortError')setError('暂时无法自动分享，可复制下方链接。')}}
  const media=post.media||[]
  const follow=async()=>{setBusy(true);setError('');const previous=post.author;apply({author:{...post.author,following:!post.author.following}});try{await api('/api/life/follow',{method:'POST',body:JSON.stringify({id:post.uid,following:!previous.following})})}catch(e){apply({author:previous});setError(e.message)}finally{setBusy(false)}}
  const bookmark=async()=>{setBusy(true);setError('');const previous=post.saved;apply({saved:!previous});try{await api('/api/life/bookmark',{method:'POST',body:JSON.stringify({id:post.id,saved:!previous})})}catch(e){apply({saved:previous});setError(e.message)}finally{setBusy(false)}}
  const choosePeer=async()=>{setShareTo('loading');try{let page=0,all=[],more=true;while(more&&page<20){const d=await api('/api/life/people?page='+page++);all.push(...d.people.filter(p=>p.canChat));more=d.more}setPeers(all);setShareTo('ready')}catch(e){setError(e.message);setShareTo(null)}}
  const sharePeer=async id=>{setBusy(true);if(shareRetry.current?.to!==id)shareRetry.current={to:id,kind:'post',postId:post.id,clientId:crypto.randomUUID()};try{await api('/api/life/message',{method:'POST',body:JSON.stringify(shareRetry.current)});shareRetry.current=null;setShareTo(null);setSharing(false);onNotice('已分享给伙伴');nav('/messages?with='+encodeURIComponent(id))}catch(e){setError(e.message)}finally{setBusy(false)}}
  const panels=<>{(comments||sharing)&&<div className="community-panel-backdrop" onClick={()=>{setComments(false);setSharing(false);setShareTo(null)}}><section className="community-panel" role="dialog" aria-modal="true" aria-label={comments?'动态评论':'分享动态'} onClick={e=>e.stopPropagation()}><div className="life-section-head"><h2>{comments?'评论 '+(post.commentCount??post.comments?.length??0):'分享这份日常'}</h2><button className="life-icon" aria-label="关闭面板" onClick={()=>{setComments(false);setSharing(false);setShareTo(null)}}><Icon name="x"/></button></div>{comments?<CommentPanel post={post} user={user} onUpdate={apply}/>:<><div className="share-choices"><button onClick={choosePeer}><Icon name="message"/>发给伙伴</button><button disabled={busy||post.originalDeleted} onClick={repost}><Icon name="share"/>转发到社区</button><button onClick={share}><Icon name="link"/>分享链接</button></div>{shareTo==='loading'&&<p>正在寻找互关伙伴…</p>}{shareTo==='ready'&&(!peers.length?<p>还没有互关伙伴，互相关注后就能分享和聊天。</p>:peers.map(p=><button className="share-person" disabled={busy} key={p.id} onClick={()=>sharePeer(p.id)}><Avatar person={p}/>{p.nickname}</button>))}</>}{error&&<p className="life-error" role="alert">{error}</p>}</section></div>}</>
  if(immersive)return <article className="immersive-post" id={'post-'+post.id}>
    <div className="immersive-media">{(media.length||post.music)?<PostMedia post={post} priority={priority}/>:original?.media?.length?<PostMedia post={original} priority={priority}/>:<div className="immersive-text" tabIndex={0}>{post.text||original?.text||'记录每一次进步'}</div>}</div>
    <div className="immersive-info"><button className="author-name" onClick={()=>nav('/member?id='+encodeURIComponent(post.uid))}>@{post.author.nickname}</button>{media.length>0&&post.text&&<details className="post-description"><summary>{post.text.slice(0,55)}{post.text.length>55?'…':''}</summary>{post.text.length>55&&<p>{post.text}</p>}</details>}<div className="post-tags">{(post.tags||[]).map(tag=><button key={tag} onClick={()=>nav('/community?tag='+encodeURIComponent(tag))}>#{tag}</button>)}</div>{original&&<span>转发 @{original.author.nickname}</span>}{post.originalDeleted&&<span>原动态已删除或暂不可见</span>}</div>
    <div className="immersive-actions"><button aria-label="查看作者主页" className="avatar-button" onClick={()=>nav('/member?id='+encodeURIComponent(post.uid))}><Avatar person={post.author} size={44}/></button>{post.uid!==user.id&&<button disabled={busy} aria-pressed={!!post.author.following} onClick={follow}><Icon name={post.author.following?'check':'plus'}/><span>{post.author.following?'已关注':'关注'}</span></button>}<button disabled={busy} aria-label="点赞" aria-pressed={post.liked} onClick={()=>doAction({action:'like',liked:!post.liked})}><Icon name="heart"/><span>{post.likeCount||'点赞'}</span></button><button aria-label="评论" onClick={()=>setComments(true)}><Icon name="message"/><span>{(post.commentCount??post.comments?.length??0)||'评论'}</span></button><button disabled={busy} aria-label="收藏" aria-pressed={!!post.saved} onClick={bookmark}><Icon name={post.saved?'starFill':'star'}/><span>{post.saved?'已收藏':'收藏'}</span></button><button aria-label="转发" onClick={()=>setSharing(true)}><Icon name="share"/><span>{post.shareCount||'转发'}</span></button>{(post.uid===user.id||user.admin)&&<button aria-label="更多作品操作" onClick={()=>setMore(v=>!v)}><span aria-hidden="true">•••</span></button>}</div>
    {more&&<div className="post-more-menu"><button onClick={()=>{setMore(false);setDeleting(true)}}><Icon name="trash"/>删除作品</button></div>}{deleting&&<div className="post-delete-confirm" role="alertdialog" aria-label="确认删除动态">删除这条日常？<button disabled={busy} onClick={()=>doAction({action:'delete'})}>确认删除</button><button onClick={()=>setDeleting(false)}>取消</button></div>}{error&&!comments&&!sharing&&<p className="post-error" role="alert">{error}</p>}{createPortal(panels,document.body)}
  </article>

  return <article className="card life-post" id={'post-'+post.id}><header className="life-post-header"><button className="avatar-button" aria-label="查看作者主页" onClick={()=>nav('/member?id='+encodeURIComponent(post.uid))}><Avatar person={post.author}/></button><div><button className="life-link" onClick={()=>nav('/member?id='+encodeURIComponent(post.uid))}>{post.author.nickname}</button><time dateTime={new Date(post.createdAt).toISOString()}>{new Date(post.createdAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></div>{(post.uid===user.id||user.admin)&&<button className="life-link" aria-label="删除这条动态" onClick={()=>setDeleting(v=>!v)}>删除</button>}</header>
    <p className="small muted">{({workout:'训练打卡',nutrition:'饮食',progress:'进步记录',general:'日常'})[post.category]||'日常'} {(post.tags||[]).map(tag=><button key={tag} className="life-link" onClick={()=>nav('/community?tag='+encodeURIComponent(tag))}>#{tag} </button>)}</p><button className="life-link" disabled={busy} aria-pressed={!!post.saved} onClick={bookmark}>{post.saved?'已收藏':'收藏动态'}</button>
    {post.uid!==user.id&&<div className="life-member-actions"><button className="life-secondary" disabled={busy} aria-pressed={!!post.author.following} onClick={follow}>{post.author.following?'已关注':post.author.followsYou?'回关':'关注'}</button><button className="life-link" onClick={()=>nav('/messages?with='+encodeURIComponent(post.uid))}>私聊</button></div>}
    {post.text&&<p className="life-post-text">{post.text}</p>}
    {(media.length>0||post.music)&&<PostMedia post={post} priority={priority}/>}
    {original&&<div className="life-repost"><strong>转发 @{original.author.nickname}</strong><p className="life-post-text">{original.text}</p><div className="life-post-media">{original.media?.map(id=><Attachment key={id} id={id} video={original.videoIds?.includes(id)}/>)}</div></div>}{post.originalDeleted&&<p className="life-notice">原动态已删除或暂不可见。</p>}
    <footer className="life-post-actions"><button disabled={busy} aria-pressed={post.liked} onClick={()=>doAction({action:'like',liked:!post.liked})}><Icon name="heart"/>{post.liked?'已点赞':'点赞'} {post.likeCount||''}</button><button onClick={()=>setComments(v=>!v)}><Icon name="message"/>评论 {(post.commentCount??post.comments?.length??0)||''}</button><button onClick={()=>setSharing(v=>!v)}><Icon name="share"/>转发 {post.shareCount||''}</button></footer>
    {deleting&&<div className="life-notice">确定删除这条动态？<div className="life-actions"><button className="danger" disabled={busy} onClick={()=>doAction({action:'delete'})}>确认删除动态</button><button onClick={()=>setDeleting(false)}>取消</button></div></div>}
    {error&&<p className="life-error" role="alert">{error}</p>}{createPortal(panels,document.body)}
  </article>
}
export default function Community(){const user=useStore(s=>s.user),[q]=useSearchParams(),loc=useLocation();if(q.get('post'))return <Navigate replace state={loc.state} to={'/community/post/'+encodeURIComponent(q.get('post'))}/>;return <div className="community-page"><PostFeed key={user?.id||'guest'}/></div>}
export function PostViewer(){const {id}=useParams();const [q]=useSearchParams();const loc=useLocation();return <div className="community-page post-viewer"><header className="community-viewer-head"><ReturnButton fallback="/community"/><span>健身日常</span></header><PostFeed key={id} viewer sourceKey={loc.state?.workSource} startPost={id} authorId={q.get('author')} saved={q.get('saved')==='1'}/></div>}
