// @vitest-environment happy-dom
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
const db=vi.hoisted(()=>new Map())
vi.mock('./api.js',()=>({api:vi.fn(),appBase:()=>'/'}))
vi.mock('./lifestyle-cache.js',()=>({readLifeCache:vi.fn(async owner=>structuredClone(db.get(owner)||null)),changeLifeCache:vi.fn(async(owner,fn)=>{const result=fn(structuredClone(db.get(owner)||{meals:[],templates:[],pendingMeals:[]}));db.set(owner,structuredClone(result));return result})}))
import {api} from './api.js'
import {changeLifeCache} from './lifestyle-cache.js'
import {useLifestyle} from './lifestyle.js'
const meal={date:'2026-10-18',type:'lunch',items:[{name:'测试食物',calories:200}]}
const networkError=()=>Object.assign(new Error('network'),{status:0})
beforeEach(()=>{db.clear();api.mockReset();changeLifeCache.mockClear();Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});useLifestyle.setState({owner:'a',profile:{nickname:'甲'},meals:[],templates:[],ai:{configured:true},pendingMeals:[],syncingMeals:false,error:'',cacheError:''})})
afterEach(()=>{delete navigator.onLine})
it('persists an account-bound offline draft before showing it as saved and keeps an editable new draft cancellable',async()=>{
 const saved=await useLifestyle.getState().saveMeal(meal);expect(api).not.toHaveBeenCalled();expect(saved._pending).toBe(true);expect(db.get('a').pendingMeals).toHaveLength(1);expect(db.has('b')).toBe(false)
 await useLifestyle.getState().saveMeal({...saved,items:[{name:'修改后',calories:250}]});expect(db.get('a').pendingMeals).toHaveLength(1)
 await useLifestyle.getState().discardPending(saved.id);expect(useLifestyle.getState().pendingMeals).toEqual([]);expect(useLifestyle.getState().meals).toEqual([])
})
it('uses the same retry key after a lost response so a reconnect cannot duplicate a new meal',async()=>{
 Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});api.mockRejectedValueOnce(networkError()).mockImplementationOnce(async(path,opts)=>({meal:{...JSON.parse(opts.body),id:'server-id',updatedAt:200}}))
 await useLifestyle.getState().saveMeal(meal);await vi.waitFor(()=>expect(useLifestyle.getState().pendingMeals).toHaveLength(0))
 expect(api).toHaveBeenCalledTimes(2);const first=JSON.parse(api.mock.calls[0][1].body),second=JSON.parse(api.mock.calls[1][1].body);expect(first.clientId).toBeTruthy();expect(second.clientId).toBe(first.clientId);expect(useLifestyle.getState().meals[0].id).toBe('server-id')
})
it('does not claim local success if the cache write fails',async()=>{
 changeLifeCache.mockRejectedValueOnce(new Error('quota'));await expect(useLifestyle.getState().saveMeal(meal)).rejects.toThrow('quota');expect(useLifestyle.getState().meals).toEqual([])
})
it('retains pending content when the server rejects a conflicting edit',async()=>{
 useLifestyle.setState({meals:[{...meal,id:'old',updatedAt:10}]});const saved=await useLifestyle.getState().saveMeal({...meal,id:'old',updatedAt:10});Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});api.mockRejectedValue(Object.assign(new Error('conflict'),{status:409}));await useLifestyle.getState().flushMeals();expect(useLifestyle.getState().pendingMeals).toHaveLength(1);expect(useLifestyle.getState().error).toContain('冲突');expect(saved._baseUpdatedAt).toBe(10)
})
it('does not place an old account cache or response into a new account',async()=>{
 await useLifestyle.getState().saveMeal(meal);Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});let finish;api.mockReturnValueOnce(new Promise(r=>finish=r));const pending=useLifestyle.getState().flushMeals();await vi.waitFor(()=>expect(api).toHaveBeenCalledTimes(1));useLifestyle.setState({owner:'b',profile:{nickname:'乙'},meals:[],pendingMeals:[],syncingMeals:false});finish({meal:{...meal,id:'a-private'}});await pending;expect(useLifestyle.getState().meals).toEqual([]);expect(useLifestyle.getState().profile.nickname).toBe('乙');expect(db.get('a').pendingMeals).toHaveLength(1)
})
