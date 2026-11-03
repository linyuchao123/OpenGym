// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import Avatar from './Avatar.jsx'
vi.mock('../lib/lifestyle.js',()=>({useLifestyle:selector=>selector({profile:{}})}))
vi.mock('../store/useStore.js',()=>({useStore:selector=>selector({user:null})}))
let host,root
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-03T07:00:00Z'));host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()})
it('shows a live status ring and removes it automatically at expiry without reload',async()=>{await act(async()=>root.render(<Avatar person={{nickname:'我',currentStatus:{emoji:'💪',text:'训练中',expiresAt:Date.now()+86400000}}}/>));expect(host.querySelector('.has-live-status')).toBeTruthy();await act(async()=>vi.advanceTimersByTime(86400001));expect(host.querySelector('.has-live-status')).toBeNull()})
it('clearing status removes the ring immediately, expired statuses never get a ring',async()=>{const person={nickname:'伙伴',currentStatus:{expiresAt:Date.now()+3000}};await act(async()=>root.render(<Avatar person={person}/>));expect(host.querySelector('.has-live-status')).toBeTruthy();await act(async()=>root.render(<Avatar person={{...person,currentStatus:null}}/>));expect(host.querySelector('.has-live-status')).toBeNull();await act(async()=>root.render(<Avatar person={{...person,currentStatus:{expiresAt:Date.now()-1}}}/>));expect(host.querySelector('.has-live-status')).toBeNull()})
