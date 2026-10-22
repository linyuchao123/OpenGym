// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { passkeyBrowser, passkeyRecovery, browserOpenUrl } from './passkey-browser.js'
describe('cross browser passkey recovery', () => {
  it('guides Android WeChat to Android browsers, without falsely denying WebAuthn', () => {
    const ua='Mozilla/5.0 (Linux; Android 14) Chrome/130 MicroMessenger/8.0'
    expect(passkeyBrowser(ua)).toMatchObject({embedded:true,wechat:true,android:true})
    expect(passkeyRecovery({name:'NotAllowedError'},ua)).toContain('Chrome')
    expect(passkeyRecovery({name:'NotAllowedError'},ua)).not.toContain('Safari')
  })
  it('guides Apple WeChat to Safari and recognizes ordinary Android browsers', () => {
    expect(passkeyBrowser('iPhone MicroMessenger/8.0').browser).toContain('Safari')
    expect(passkeyBrowser('Android Chrome/130').embedded).toBe(false)
    expect(passkeyRecovery({name:'SecurityError'},'Android')).toContain('HTTPS')
  })
  it('preserves an invitation, excluding device-link and other tokens', () => {
    expect(browserOpenUrl({href:'https://gym.example/?invite=ABC&link=SECRET&token=PRIVATE#/me'})).toBe('https://gym.example/?invite=ABC#/me')
    expect(browserOpenUrl({href:'https://gym.example/#/?token=SECRET'})).toBe('https://gym.example/#/')
    expect(browserOpenUrl({href:'https://gym.example/#/home?invite=OLD&link=SECRET'})).toBe('https://gym.example/?invite=OLD#/home')
  })
  it('directs an unknown credential to the original account, not duplicate registration', () => {
    expect(passkeyRecovery({data:{code:'unknown-credential'}},'Android')).toContain('无需重新注册')
  })
})
