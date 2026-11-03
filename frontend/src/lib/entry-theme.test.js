// @vitest-environment happy-dom
import {it,expect,vi} from 'vitest'
import {entryTheme,chooseEntryTheme,THEME_KEY} from './entry-theme.js'
it('persists explicit entry choices for login and ignores invalid stored values',()=>{localStorage.clear();expect(entryTheme()).toBeNull();const listener=vi.fn();window.addEventListener('gym-entry-theme',listener);for(const theme of ['light','dark','system']){chooseEntryTheme(theme);expect(entryTheme()).toBe(theme)}expect(listener).toHaveBeenCalledTimes(3);chooseEntryTheme('bad');expect(entryTheme()).toBe('system');localStorage.setItem(THEME_KEY,'bad');expect(entryTheme()).toBeNull();window.removeEventListener('gym-entry-theme',listener)})
