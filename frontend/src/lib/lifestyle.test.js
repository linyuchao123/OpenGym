// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('./api.js',()=>({api:vi.fn(),appBase:()=>'/'}))
import { api } from './api.js'
import { useLifestyle } from './lifestyle.js'
beforeEach(()=>{api.mockReset();useLifestyle.setState({owner:null,loadedOwner:null,profileSequence:0,profileSaving:false,profile:{},meals:[],ai:{configured:false},loading:false,error:''})})
it('an old account response cannot overwrite the newly signed-in account',async()=>{
  let finish
  api.mockReturnValueOnce(new Promise(resolve=>{finish=resolve})).mockResolvedValueOnce({profile:{nickname:'乙'},meals:[],ai:{configured:true}})
  const old=useLifestyle.getState().load({id:'a'})
  await useLifestyle.getState().load({id:'b'})
  finish({profile:{nickname:'甲'},meals:[{id:'private-a'}]});await old
  expect(useLifestyle.getState().owner).toBe('b');expect(useLifestyle.getState().profile.nickname).toBe('乙');expect(useLifestyle.getState().meals).toEqual([])
})
it('a failed server write is not presented as a saved meal',async()=>{
  useLifestyle.setState({owner:'a',meals:[{id:'old',items:[]}]});api.mockRejectedValueOnce(new Error('服务器暂时不可用'))
  await expect(useLifestyle.getState().saveMeal({items:[]})).rejects.toThrow('服务器暂时不可用')
  expect(useLifestyle.getState().meals.map(x=>x.id)).toEqual(['old'])
})
it('a profile save response is ignored after switching accounts',async()=>{
  let finish;api.mockReturnValueOnce(new Promise(resolve=>{finish=resolve}));useLifestyle.setState({owner:'a',loadedOwner:'a'})
  const pending=useLifestyle.getState().saveProfile({nickname:'甲'});await vi.waitFor(()=>expect(api).toHaveBeenCalledTimes(1))
  useLifestyle.setState({owner:'b',profile:{nickname:'乙'}});finish({profile:{nickname:'甲'}});await pending
  expect(useLifestyle.getState().profile.nickname).toBe('乙')
})
it('a favorite save response cannot populate a different account after switching',async()=>{
 let finish;api.mockReturnValueOnce(new Promise(resolve=>{finish=resolve}));useLifestyle.setState({owner:'a',templates:[]})
 const pending=useLifestyle.getState().saveTemplate({name:'甲的常吃餐',items:[]});useLifestyle.setState({owner:'b',templates:[{id:'b'}]});finish({template:{id:'a',name:'甲的常吃餐'}});await pending
 expect(useLifestyle.getState().templates).toEqual([{id:'b'}])
})
it('a weight sync cannot write while the profile is still loading',async()=>{useLifestyle.setState({owner:'a',loadedOwner:null,loading:true,profile:{}});await useLifestyle.getState().syncWeight(74,Date.now());expect(api).not.toHaveBeenCalled()})
it('background weight sync uses PATCH with no avatar, bio or public settings',async()=>{useLifestyle.setState({owner:'a',loadedOwner:'a',loading:false,profile:{nickname:'甲',bio:'保留简介',avatar:'local',version:1}});api.mockResolvedValue({profile:{nickname:'甲',bio:'保留简介',avatar:'local',version:1,weightKg:74}});await useLifestyle.getState().syncWeight(74,123);expect(api).toHaveBeenCalledWith('/api/life/profile',expect.objectContaining({method:'PATCH',body:JSON.stringify({weightKg:74,bodyUpdatedAt:123})}));expect(useLifestyle.getState().profile.bio).toBe('保留简介')})
it('a slow old load cannot replace a newer confirmed profile save',async()=>{useLifestyle.setState({owner:'a',loadedOwner:'a',profile:{nickname:'甲',bio:'新简介',version:20}});api.mockResolvedValue({profile:{nickname:'甲',bio:'旧简介',version:10},meals:[],ai:{configured:true}});await useLifestyle.getState().load({id:'a'});expect(useLifestyle.getState().profile.bio).toBe('新简介');expect(useLifestyle.getState().loadedOwner).toBe('a')})
