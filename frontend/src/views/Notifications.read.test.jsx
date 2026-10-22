// @vitest-environment happy-dom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {it,expect,vi,afterEach} from 'vitest';
import {Notifications} from './LifeHub.jsx';
import {api} from '../lib/api.js';
import {useStore} from '../store/useStore.js';
import {useUnread,resetUnread} from '../lib/unread.js';
vi.mock('../lib/api.js',()=>({api:vi.fn(),appBase:()=>'/'}));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host;
afterEach(()=>{if(root)act(()=>root.unmount());host?.remove();resetUnread();vi.clearAllMocks()});
it('entering message center clears loaded reminders without clicking a notification and keeps later arrivals',async()=>{
 useStore.setState({user:{id:'reader',name:'读者'}});resetUnread('reader');useUnread.setState({count:16,messages:1,interactions:15});
 const item={id:'n-before',from:'friend',kind:'follow',author:{nickname:'伙伴'},createdAt:Date.now(),readAt:null};let count=16,version=0;
 api.mockImplementation(async(path,opts)=>{
  if(path==='/api/life/notifications')return {items:version?[{...item,id:'n-after'}, {...item,readAt:1}]:[item],readThrough:{notification:'n-before',message:'m-before'},prefs:{},unread:count};
  if(path==='/api/life/notifications/read'){expect(JSON.parse(opts.body)).toEqual({through:{notification:'n-before',message:'m-before'}});count=0;return {ok:true}}
  if(path==='/api/life/unread')return {total:count,messages:0,interactions:count};return {};
 });
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(<MemoryRouter><Notifications/></MemoryRouter>));
 expect(api.mock.calls.filter(([p])=>p==='/api/life/notifications/read')).toHaveLength(1);
 expect(host.querySelectorAll('.life-event.unread')).toHaveLength(0);expect(useUnread.getState().count).toBe(0);
 version=1;count=1;
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='刷新').click());
 expect(host.querySelectorAll('.life-event.unread')).toHaveLength(1);
 expect(api.mock.calls.filter(([p])=>p==='/api/life/notifications/read')).toHaveLength(1);
});
