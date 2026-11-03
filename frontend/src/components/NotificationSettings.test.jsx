// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import NotificationSettings from './NotificationSettings.jsx'
import {useStore} from '../store/useStore.js'
import {enablePush} from '../lib/push.js'
vi.mock('../lib/push.js',()=>({enablePush:vi.fn(),disablePush:vi.fn(),pushSupported:()=>true,syncPushSubscription:async()=>false,sendTestPush:vi.fn()}))
vi.mock('../lib/api.js',()=>({api:async()=>({preferences:{messages:false,reminderAt:null}})}))
let host,root
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);useStore.setState({user:{id:'qa'},config:{hosting:'cloudflare-r2',cloudflare:{push:true}}})})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.clearAllMocks()})
it('shows pending immediately then actionable failure and allows a successful retry',async()=>{let reject;enablePush.mockImplementationOnce(()=>new Promise((_,r)=>{reject=r}));await act(async()=>root.render(<NotificationSettings/>));await act(async()=>host.querySelector('button').click());expect(host.textContent).toContain('正在处理通知设置');expect(host.querySelector('button').disabled).toBe(true);await act(async()=>reject(Error('请在系统设置中允许通知')));expect(host.textContent).toContain('请在系统设置中允许通知');expect(host.querySelector('button').disabled).toBe(false);enablePush.mockResolvedValueOnce();await act(async()=>host.querySelector('button').click());expect(host.textContent).toContain('发送测试通知');expect(host.textContent).toContain('设备通知已开启')})
