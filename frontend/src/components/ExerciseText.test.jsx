// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { _setDetails, _setLangState } from '../lib/i18n-core.js'
import { ExerciseDescription, ExerciseInstructions } from './ExerciseText.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
const ex = { id: 'qa-chinese', n: 'Example', st: ['Keep your back straight.'], desc: 'An English description.' }
beforeEach(() => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  _setLangState('zh', {}, null, null, false)
  _setDetails({}, {}, null, 'zh')
})
afterEach(() => { act(() => root.unmount()); host.remove(); _setLangState('en', {}, null, null) })

it('keeps untranslated English steps behind a closed disclosure with a Chinese explanation', () => {
  act(() => root.render(<ExerciseInstructions ex={ex} />))
  expect(host.querySelector('p').textContent).toContain('暂未提供中文步骤')
  expect(host.querySelector('details').open).toBe(false)
  expect(host.querySelector('details li').textContent).toBe('Keep your back straight.')
})

it('shows available Chinese steps directly', () => {
  _setLangState('zh', {}, { [ex.id]: ['保持背部挺直。'] }, null, false)
  act(() => root.render(<ExerciseInstructions ex={ex} />))
  expect(host.querySelector('details')).toBeNull()
  expect(host.querySelector('li').textContent).toBe('保持背部挺直。')
})

it('keeps the built-in English description optional and preserves a custom Chinese description', () => {
  act(() => root.render(<ExerciseDescription ex={ex} />))
  expect(host.querySelector('details').open).toBe(false)
  act(() => root.render(<ExerciseDescription ex={{ ...ex, custom: true, desc: '自己补充的说明。' }} />))
  expect(host.querySelector('details')).toBeNull()
  expect(host.textContent).toBe('自己补充的说明。')
})
