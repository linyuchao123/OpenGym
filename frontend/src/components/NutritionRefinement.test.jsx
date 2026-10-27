// @vitest-environment happy-dom
import React,{act} from 'react'
import {it,expect,vi,beforeEach,afterEach} from 'vitest'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import Nutrition from '../views/Nutrition.jsx'
import {useStore,freshState} from '../store/useStore.js'
import {useLifestyle} from '../lib/lifestyle.js'
import {nutritionStats} from '../lib/nutrition.js'
import {trendRows} from './NutritionTrends.jsx'
vi.mock('../lib/api.js',()=>({api:vi.fn(async()=>({})),appBase:()=>'/'}))
let host,root;globalThis.IS_REACT_ACT_ENVIRONMENT=true
beforeEach(()=>{host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);useStore.setState({user:{id:'qa',name:'验收'},S:freshState()});useLifestyle.setState({owner:'qa',loadedOwner:'qa',profile:{},meals:[],templates:[],foods:[],mealPlans:[],nutritionConfig:null,nutritionHistory:[],loading:false,error:''});vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}})})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.unstubAllGlobals()})
it('dates belong only to records and all four trend presentations are reachable',async()=>{await act(async()=>root.render(<MemoryRouter><Nutrition/></MemoryRouter>));expect(host.querySelector('[aria-label="饮食日期"]')).toBeTruthy();for(const id of ['plan','foods','trends']){await act(async()=>host.querySelector('#nutrition-tab-'+id).click());expect(host.querySelector('[aria-label="饮食日期"]')).toBeNull();expect(host.querySelector('.nutrition-date-nav')).toBeNull()}for(const label of ['条形图','折线图','圆环图','表格']){const b=[...host.querySelectorAll('[role=tab]')].find(b=>b.textContent===label);expect(b).toBeTruthy();await act(async()=>b.click());expect(b.getAttribute('aria-selected')).toBe('true')}})
it('preserves a logged zero while missing meals and missing macros remain null',()=>{const stats=nutritionStats([{date:'2026-10-27',type:'breakfast',items:[{name:'零热量记录',calories:0,protein:null,carbs:0,fat:null}]}],'2026-10-27','week');const rows=trendRows(stats,'week'),day=rows.find(r=>r.key==='2026-10-27');expect(day.value).toBe(0);expect(day.protein).toBe(null);expect(day.carbs).toBe(0);expect(rows.find(r=>r.key==='2026-10-26').value).toBe(null)})
