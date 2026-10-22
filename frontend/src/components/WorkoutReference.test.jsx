// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect} from 'vitest'
import WorkoutReference from './WorkoutReference.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
it('excludes warm-ups, counts each side, and presents reference data without changing current sets',()=>{
 const entry={sets:[{phase:'warmup',w:10,r:5,done:true},{w:20,r:10,done:false,sides:{L:{w:20,r:5,done:true},R:{w:20,r:5,done:false}}}]}
 const reference={d:'2026-10-17',sets:[{phase:'warmup',w:5,r:5,done:true},{w:18,r:10,done:true}]};const before=structuredClone(entry)
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 try{act(()=>root.render(<WorkoutReference entry={entry} reference={reference} label={s=>`${s.w} kg × ${s.r}`}/>));expect(host.textContent).toContain('1 / 2');expect(host.textContent).toContain('部分完成');expect(host.querySelectorAll('tbody tr')).toHaveLength(1);expect(host.textContent).toContain('18 kg × 10');expect(entry).toEqual(before)}finally{act(()=>root.unmount());host.remove()}
})
