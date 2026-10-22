// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect,vi,afterEach} from 'vitest'
import {useVisiblePoll} from './use-visible-poll.js'
let host,root;globalThis.IS_REACT_ACT_ENVIRONMENT=true
function Poll({load}){useVisiblePoll(load,5000,[]);return null}
afterEach(()=>{act(()=>root?.unmount());host?.remove();vi.useRealTimers();vi.restoreAllMocks()})
async function mount(load){host=document.createElement('div');root=createRoot(host);await act(async()=>root.render(<Poll load={load}/>))}
it('sleeps in hidden tabs and resumes immediately when visible',async()=>{vi.useFakeTimers();const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(false),load=vi.fn().mockResolvedValue();await mount(load);expect(load).toHaveBeenCalledTimes(1);hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));await act(async()=>vi.advanceTimersByTimeAsync(20000));expect(load).toHaveBeenCalledTimes(1);hidden.mockReturnValue(false);await act(async()=>document.dispatchEvent(new Event('visibilitychange')));expect(load).toHaveBeenCalledTimes(2)})
it('backs off a failed request and never overlaps a pending request',async()=>{vi.useFakeTimers();vi.spyOn(document,'hidden','get').mockReturnValue(false);let finish;const load=vi.fn().mockRejectedValueOnce(new Error('network')).mockImplementationOnce(()=>new Promise(r=>{finish=r}));await mount(load);await act(async()=>vi.advanceTimersByTimeAsync(5000));expect(load).toHaveBeenCalledTimes(1);await act(async()=>vi.advanceTimersByTimeAsync(5000));expect(load).toHaveBeenCalledTimes(2);await act(async()=>vi.advanceTimersByTimeAsync(60000));expect(load).toHaveBeenCalledTimes(2);await act(async()=>finish())})
