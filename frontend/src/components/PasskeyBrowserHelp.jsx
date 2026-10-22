import { useState } from 'react'
import { passkeyBrowser, browserOpenUrl } from '../lib/passkey-browser.js'
import { copyText } from '../lib/clipboard.js'
import { Button } from './ui.jsx'

export default function PasskeyBrowserHelp({ unsupported = false, passwordEnabled = false }) {
  const env = passkeyBrowser()
  const [message, setMessage] = useState('')
  const url = browserOpenUrl()
  const copy = async () => setMessage(await copyText(url) ? '已复制，请粘贴到浏览器打开。邀请码会保留。' : '未能自动复制，请长按下方网址复制。')
  return <section className="life-notice" style={{textAlign:'start', marginTop:16, overflowWrap:'anywhere'}} aria-label="浏览器登录帮助">
    <strong>{env.wechat ? '微信中如何登录？' : unsupported ? (passwordEnabled ? '此浏览器可以使用密码登录' : '换一个浏览器继续登录') : '苹果、安卓和电脑都可以使用'}</strong>
    <p>{env.embedded ? `当前是应用内置浏览器。若无法弹出验证，请点右上角“…”选择“在浏览器打开”，或复制网址到${env.browser}。` : `建议使用${env.browser}。通行密钥需要系统屏幕锁和可用的密码管理器，指纹功能本身不等于已保存本站密钥。`}</p>
    {unsupported && <p>{passwordEnabled ? '当前浏览器不提供通行密钥，请使用上方“密码登录”。新用户选择“创建新账号”，凭邀请码和密码注册即可。' : '当前页面未检测到 WebAuthn 支持，请换浏览器后重试。网站不能替内置浏览器开启此能力。'}</p>}
    {env.android && <p>Android 请更新浏览器，并在系统设置中检查通行密钥／密码管理服务；不同品牌手机的支持情况可能不同。</p>}
    {(env.embedded || unsupported) && <><Button onClick={copy}>复制本站链接</Button><input className="input" style={{marginTop:8,minWidth:0,width:'100%',fontSize:14}} aria-label="在浏览器打开的网址" value={url} readOnly onFocus={e=>e.target.select()} />{message && <p role="status">{message}</p>}</>}
    <details><summary>换手机或换浏览器，如何登录原账号？</summary><p>{passwordEnabled && '原账号尚未设置密码时，请先在已登录设备的“设置 → 账号 → 密码”中设置，再到安卓设备登录；不会创建新账号。'}同一密码管理器中已有本站密钥时可直接登录，也可选择系统提供的“使用其他设备”扫码验证。不同密码管理器不会自动共享密钥。</p><p>若新设备没有密钥：在另一台已登录设备的“我的 → 设置与数据 → 全部设置 → 账号 → 添加其他设备”生成一次性设备码，在新设备的支持浏览器中选择“使用另一台设备上的代码”。这会连接原账号，无需重新注册。</p><p>仅使用自己设备生成的代码，不要把设备码或扫码验证交给陌生人。换浏览器后登录状态不会自动迁移。</p></details>
  </section>
}
