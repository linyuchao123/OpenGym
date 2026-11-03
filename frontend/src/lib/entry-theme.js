export const THEME_KEY='gym-entry-theme';
export function entryTheme(){try{const value=localStorage.getItem(THEME_KEY);return ['light','dark','system'].includes(value)?value:null}catch{return null}}
export function chooseEntryTheme(value){if(!['light','dark','system'].includes(value))return;try{localStorage.setItem(THEME_KEY,value)}catch{}window.dispatchEvent(new Event('gym-entry-theme'))}
