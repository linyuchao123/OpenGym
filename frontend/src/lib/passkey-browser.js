// UA is guidance only. Never deny a working WebAuthn implementation by browser brand.
export function passkeyBrowser(ua = navigator.userAgent) {
  const android = /Android/i.test(ua)
  const apple = /iPhone|iPad|iPod/i.test(ua)
  return {
    embedded: /MicroMessenger|\bQQ\/|FBAN|FBAV|Instagram|Douyin|BytedanceWebview/i.test(ua),
    wechat: /MicroMessenger/i.test(ua), android, apple,
    browser: android ? 'Chrome 或系统中支持通行密钥的浏览器' : apple ? 'Safari 或支持通行密钥的浏览器' : '新版 Chrome、Edge 或支持通行密钥的浏览器',
  }
}

export function passkeyRecovery(error, ua) {
  const { browser } = passkeyBrowser(ua)
  if (error?.data?.code === 'unknown-credential') return '本站未找到这把密钥对应的账号。请检查密码管理器是否选对，或使用另一台已登录设备上的代码连接原账号，无需重新注册。'
  if (error?.name === 'NotAllowedError' || error?.name === 'AbortError')
    return `系统未完成通行密钥验证（可能已取消、没有可用密钥或浏览器未能打开验证）。请用${browser}重试；没有这把密钥时，可使用另一台已登录设备上的代码。`
  if (['NotSupportedError', 'SecurityError', 'TypeError'].includes(error?.name))
    return `当前浏览器未能调用通行密钥。请确认通过 HTTPS 打开本站，并使用${browser}；在系统设置中启用屏幕锁和通行密钥服务。`
  if (error?.name === 'InvalidStateError') return '这台设备已保存该账号的通行密钥，请返回登录，或在系统密码管理器中检查已有密钥。'
  return ''
}

// Same site only: preserve invitation + page, but never copy session/credential material.
export function browserOpenUrl(loc = window.location) {
  const url = new URL(loc.href)
  const invite = url.searchParams.get('invite') || new URLSearchParams(url.hash.split('?')[1] || '').get('invite')
  url.search = ''
  if (invite && /^[A-Za-z0-9-]{1,40}$/.test(invite)) url.searchParams.set('invite', invite)
  url.hash = url.hash.split('?')[0]
  if (!/^#\/[\w/-]*$/.test(url.hash)) url.hash = ''
  return url.href
}
