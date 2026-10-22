// @vitest-environment happy-dom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import MyProfile from './MyProfile.jsx';
import {Members} from './Social.jsx';
import {api} from '../lib/api.js';
import {useStore} from '../store/useStore.js';
import {useLifestyle} from '../lib/lifestyle.js';
vi.mock('../lib/api.js',()=>({api:vi.fn(),appBase:()=>'/'}));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,people;
beforeEach(()=>{
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 useStore.setState({user:{id:'me',name:'验收账号'},S:{...useStore.getState().S,unit:'kg',bodyweight:[],workouts:[],routines:[]}});
 useLifestyle.setState({owner:'me',profile:{nickname:'验收账号'},loading:false,error:''});
 people=['训练伙伴甲','训练伙伴乙','尚未填写资料的新粉丝'].map((nickname,i)=>({id:'p'+i,nickname,followers:0,followingCount:1,following:false}));
 api.mockImplementation(async path=>{
  if(path.includes('/people?id='))return {person:{id:'me',nickname:'验收账号',followers:people.length,followingCount:2,postCount:0}};
  if(path.includes('/people?'))return {people:[...people],total:people.length,more:false};
  if(path.includes('/feed'))return {posts:[],next:null};
  return {};
 });
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.clearAllMocks()});
it('three profile followers open three visible rows including a member without an edited profile',async()=>{
 await act(async()=>root.render(<MemoryRouter initialEntries={['/me']}><Routes><Route path="/me" element={<MyProfile/>}/><Route path="/members" element={<Members/>}/></Routes></MemoryRouter>));
 const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='3粉丝');expect(button).toBeTruthy();
 await act(async()=>button.click());
 expect(host.querySelectorAll('article')).toHaveLength(3);expect(host.textContent).toContain('共 3 位粉丝');expect(host.textContent).toContain('尚未填写资料的新粉丝');
 people=people.slice(0,2);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='刷新列表').click());
 expect(host.querySelectorAll('article')).toHaveLength(2);expect(host.textContent).toContain('共 2 位粉丝');
});
