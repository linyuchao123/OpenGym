import {create} from 'zustand'
import {onCommunityClear} from './community-cache.js'
// Session preference only: try sound by default; never bypass browser autoplay policies.
export const useMediaSound=create(()=>({enabled:true,editing:false}))
export const preferSound=enabled=>useMediaSound.setState({enabled})
onCommunityClear(()=>preferSound(true))

export const editingMedia=editing=>useMediaSound.setState({editing})
