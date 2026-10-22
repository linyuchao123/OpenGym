const scope='luna.openapi.platform.play_core'
export function musicConnection(config){return {provider:'抖音 / 汽水音乐',keyPresent:!!config.DOUYIN_CLIENT_KEY,secretPresent:!!config.DOUYIN_CLIENT_SECRET,configured:!!(config.DOUYIN_CLIENT_KEY&&config.DOUYIN_CLIENT_SECRET),scope,rightsConfirmed:config.QISHUI_SITE_MUSIC_LICENSED==='1',collections:'需另行申请深度合作及用户授权'}}
export async function testMusicConnection(config,fetcher=fetch){
 const status=musicConnection(config);if(!status.configured)return {...status,ok:false,stage:'configuration',message:'尚未配置抖音应用 Client Key / Client Secret，无法验证本应用的接口权限。'}
 const call=async(url,init)=>{const r=await fetcher(url,{...init,signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('上游HTTP '+r.status);return r.json()}
 try{
  const token=await call('https://open.douyin.com/oauth/client_token/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_key:config.DOUYIN_CLIENT_KEY,client_secret:config.DOUYIN_CLIENT_SECRET,grant_type:'client_credential'})});
  if(!token.data?.access_token)return {...status,ok:false,stage:'token',code:Number(token.data?.error_code||token.error_code)||null,message:'未能取得应用令牌，请检查应用凭证及平台状态。'}
  const feed=await call('https://open.douyin.com/api/luna/v1/platform/feed/song-tab/',{method:'POST',headers:{'Content-Type':'application/json','access-token':token.data.access_token},body:JSON.stringify({is_first_request:true,count:1,played_media:[],with_client_cache:true})});
  const code=Number(feed.err_no??feed.data?.error_code??feed.error_code??-1),ok=code===0;
  return {...status,ok,stage:'recommendation',code,message:ok?'推荐接口调用成功；这仅验证接口可用，仍须确认本站配乐授权和歌曲使用范围。':'推荐接口未通过，请在开放平台核对汽水音乐权限、接入审核及请求要求。'}
 }catch{return {...status,ok:false,stage:'network',message:'暂时无法完成官方接口验证，请稍后重试。'}}
}
