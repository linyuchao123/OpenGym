// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect,vi} from 'vitest'
import CalorieHeatmap,{calorieDays} from './CalorieHeatmap.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
it('sums meals on valid days while keeping missing dates distinct from recorded zero',()=>{
 const rows=[{date:'2026-10-12',items:[{calories:200}]},{date:'2026-10-12',items:[{calories:300}]},{date:'2026-10-13',items:[{calories:0}]},{date:'2026-13-01',items:[]},{date:'2026-02-30',items:[]}]
 const days=calorieDays(rows);expect(days['2026-10-12']).toEqual({calories:500,meals:2});expect(days['2026-10-13'].calories).toBe(0);expect(days['2026-10-14']).toBeUndefined();expect(Object.keys(days)).toHaveLength(2)
})
it('lets keyboard users select a day and displays the updated external date',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-16T12:00:00'))
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const onDay=vi.fn()
 try {act(()=>root.render(<CalorieHeatmap meals={[]} date="2026-10-16" onDay={onDay}/>));const selected=host.querySelector('[aria-label="2026-10-15：未记录"]');act(()=>selected.click());expect(onDay).toHaveBeenCalledWith('2026-10-15');act(()=>root.render(<CalorieHeatmap meals={[]} date="2026-10-15" onDay={onDay}/>));expect(selected.getAttribute('aria-pressed')).toBe('true');expect(host.querySelector('[aria-label="2026-10-17：未记录"]').disabled).toBe(true)}finally{act(()=>root.unmount());host.remove();vi.useRealTimers()}
})
