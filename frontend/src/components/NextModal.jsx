import {useEffect,useRef,useId} from 'react'
import {useModalHistory} from '../lib/route-origin.jsx'
export default function NextModal({title,onClose,busy=false,children}){
 const ref=useRef(null),titleId=useId();useModalHistory(true,onClose,busy)
 useEffect(()=>{const previous=document.activeElement;ref.current?.focus();const trap=e=>{if(e.key!=='Tab')return;const els=[...ref.current.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled])')];if(!els.length){e.preventDefault();return}if(e.shiftKey&&(document.activeElement===els[0]||document.activeElement===ref.current)){e.preventDefault();els.at(-1).focus()}else if(!e.shiftKey&&(document.activeElement===els.at(-1)||document.activeElement===ref.current)){e.preventDefault();els[0].focus()}};document.addEventListener('keydown',trap);return()=>{document.removeEventListener('keydown',trap);previous?.focus?.()}},[])
 return <div className="life-modal-backdrop"><section ref={ref} tabIndex={-1} className="life-modal next-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}><header className="life-section-head"><h2 id={titleId}>{title}</h2><button type="button" className="life-icon" aria-label="关闭" disabled={busy} onClick={onClose}>×</button></header>{children}</section></div>
}
