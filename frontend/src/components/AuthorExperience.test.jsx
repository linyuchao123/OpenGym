// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import {it,expect,vi,beforeEach,afterEach} from 'vitest'
import {timeGreeting,communityQRActive} from '../lib/author.js'
import {useStore} from '../store/useStore.js'
import {useLifestyle} from '../lib/lifestyle.js'
import WelcomeGuide from './WelcomeGuide.jsx'
import CommunityInvite from './CommunityInvite.jsx'
import RecordStatus from './RecordStatus.jsx'
import Author,{Updates} from '../views/Author.jsx'
import {api} from '../lib/api.js'
vi.mock('../lib/api.js',()=>({api:vi.fn(),appBase:()=>'/'}))
let root,host
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);useStore.setState({user:{id:'member',name:'会员'},S:{welcomeVersion:0},sync:{status:'ok'},update:fn=>{const S={...useStore.getState().S};fn(S);useStore.setState({S})}});useLifestyle.setState({pendingMeals:[],error:'',syncingMeals:false,meals:[]});api.mockResolvedValue({ok:true})})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks()})
const render=async node=>act(async()=>root.render(<MemoryRouter>{node}</MemoryRouter>))
it('changes local-time greeting at every boundary',()=>{for(const [h,label] of [[0,'夜深了'],[4,'夜深了'],[5,'早上好'],[10,'早上好'],[11,'中午好'],[13,'中午好'],[14,'下午好'],[17,'下午好'],[18,'晚上好'],[22,'晚上好'],[23,'夜深了']])expect(timeGreeting(new Date(2026,9,25,h))).toBe(label)})
it('expires the group QR at the printed deadline',async()=>{expect(communityQRActive(new Date('2026-10-31T15:59:59Z'))).toBe(true);expect(communityQRActive(new Date('2026-10-31T16:00:00Z'))).toBe(false);vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-02'));await render(<CommunityInvite/>);expect(host.querySelector('img')).toBeNull();expect(host.textContent).toContain('已到期');expect(host.querySelector('a').href).toContain('wechat.jpeg')})
it('invites first-time accounts once, traps focus and can be reopened manually',async()=>{await render(<WelcomeGuide/>);expect(host.textContent).toContain('欢迎加入 OpenGym');expect(host.textContent).toContain('共建者社区');expect(document.activeElement).toBe(host.querySelector('[role=dialog]'));await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(useStore.getState().S.welcomeVersion).toBe(1);await render(<WelcomeGuide key="revisit"/>);expect(host.querySelector('[role=dialog]')).toBeNull();await render(<WelcomeGuide key="manual" manual/>);expect(host.querySelector('[role=dialog]')).not.toBeNull()})
it('hides healthy routine status but retains failed and pending meal warnings',async()=>{await render(<RecordStatus warningsOnly/>);expect(host.textContent).toBe('');await act(async()=>useStore.setState({sync:{status:'error'}}));expect(host.textContent).toContain('同步失败');await act(async()=>{useStore.setState({sync:{status:'ok'}});useLifestyle.setState({pendingMeals:[{}]})});expect(host.textContent).toContain('等待同步');expect(host.textContent).not.toContain('训练：已同步')})
it('shows all supplied destinations and submits feedback through the authenticated API',async()=>{await render(<Author/>);for(const url of ['https://github.com/linyuchao123','https://github.com/linyuchao123/OpenGym','https://x.com/xiaolinyx123','https://xiaolinyx.me','mailto:476638303@qq.com','mailto:lyc2416455041@gmail.com'])expect([...host.querySelectorAll('a')].some(a=>a.getAttribute('href')===url)).toBe(true);expect(host.textContent).toContain('老林的AI探秘日常');const field=host.querySelector('textarea');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'希望增加训练提醒');field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}))});await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(api).toHaveBeenCalledWith('/api/life/feedback',expect.objectContaining({method:'POST'}))})
it('states mobile distribution as ongoing work without fabricated download links',async()=>{await render(<Updates/>);expect(host.textContent).toContain('Android 安装包正在加速制作中');expect(host.textContent).toContain('iOS 上架 App Store 还需要一段时间');expect(host.querySelector('a[href$=".apk"]')).toBeNull()})
