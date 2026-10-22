// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach,afterEach,it,expect,vi } from 'vitest'
import WorkoutCardCommunity from './WorkoutCardCommunity.jsx'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { uploadLifestyle } from '../lib/lifestyle.js'
vi.mock('../lib/api.js',()=>({api:vi.fn()}))
vi.mock('../lib/lifestyle.js',()=>({uploadLifestyle:vi.fn()}))
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root,original
const workout={id:'qa-workout',d:'2026-10-18',name:'测试训练'}
const published=vi.fn()
const button=text=>[...host.querySelectorAll('button')].find(x=>x.textContent===text)
const click=async text=>act(async()=>button(text).click())
beforeEach(()=>{vi.clearAllMocks();original=useStore.getState();useStore.setState({user:{id:'qa'},S:{workouts:[workout]}});host=document.createElement('div');document.body.append(host);root=createRoot(host);uploadLifestyle.mockResolvedValue({id:'image'});api.mockResolvedValue({post:{id:'post'}})})
afterEach(()=>{act(()=>root.unmount());host.remove();useStore.setState(original)})
const render=()=>act(()=>root.render(<WorkoutCardCommunity blob={new Blob(['png'],{type:'image/png'})} workout={workout} onPublished={published}/>))
it('uploads nothing until explicit publish confirmation and sends only the card and caption',async()=>{
  render();expect(api).not.toHaveBeenCalled();await click('发布打卡到好友社区');expect(uploadLifestyle).not.toHaveBeenCalled()
  await click('取消发布');expect(api).not.toHaveBeenCalled();await click('发布打卡到好友社区');await click('确认发布给好友')
  expect(uploadLifestyle).toHaveBeenCalledTimes(1);expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({category:'workout',text:'完成训练：测试训练 💪',media:['image']});expect(published).toHaveBeenCalledWith('post')
})
it('keeps the confirmation and error visible when publishing fails',async()=>{
  api.mockRejectedValue(new Error('网络连接失败'));render();await click('发布打卡到好友社区');await click('确认发布给好友')
  expect(host.querySelector('[role=alert]').textContent).toBe('网络连接失败');expect(button('确认发布给好友').disabled).toBe(false);expect(published).not.toHaveBeenCalled()
})
it('prevents a pending upload from publishing under a different account',async()=>{
  let resolve;uploadLifestyle.mockImplementation(()=>new Promise(r=>resolve=r));render();await click('发布打卡到好友社区');await click('确认发布给好友')
  await act(async()=>{useStore.setState({user:{id:'another'}});resolve({id:'old-image'})})
  expect(api).not.toHaveBeenCalled();expect(host.querySelector('[role=alert]').textContent).toContain('账号已变化')
})
it('keeps guest sharing unavailable',()=>{
  useStore.setState({user:null});render();expect(button('发布打卡到好友社区').disabled).toBe(true)
})
