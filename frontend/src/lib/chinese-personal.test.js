import { afterEach, describe, expect, it } from 'vitest'
import zh from '../locales/zh.js'
import names from '../exercise-names/zh.js'
import steps from '../instr/zh.js'
import { CATALOGUE, searchExercises } from './exercises.js'
import { _setLangState, exerciseNameFor, instrFor, t } from './i18n-core.js'
import { buildStarterPlan } from './starter.js'

afterEach(() => _setLangState('en', {}, null, null))
const chinese = () => _setLangState('zh', zh, steps, names, false)

describe('personal Chinese edition', () => {
  it('describes plate loading as weight, rather than a rep count', () => {
    chinese()
    expect(t('{0} per side', '10 + 5')).toBe('每侧配重：10 + 5')
  })
  it('every built-in exercise has a Chinese name and can be found by that name', () => {
    chinese()
    expect(CATALOGUE.every(ex => typeof names[ex.id] === 'string' && names[ex.id].trim())).toBe(true)
    const bench = CATALOGUE.find(ex => ex.id === '0025')
    expect(exerciseNameFor(bench)).toContain('卧推')
    expect(exerciseNameFor(bench)).not.toContain(bench.n)
    expect(searchExercises(CATALOGUE, '卧推').some(ex => ex.id === bench.id)).toBe(true)
    expect(instrFor(bench).join('')).toMatch(/[\u4e00-\u9fff]/)
  })

  it('creates Chinese routine names and keeps saved plans stable when language changes', () => {
    chinese()
    const plan = buildStarterPlan('ppl')
    expect(plan.routines.map(r => r.name)).toEqual(['推力训练日', '拉力训练日', '腿部训练日'])
    for (const id of ['upper-lower', 'full-body', '5x5']) {
      expect(buildStarterPlan(id).routines.every(r => /训练/.test(r.name))).toBe(true)
    }
    _setLangState('en', {}, null, null)
    expect(plan.routines[0].name).toBe('推力训练日')
    expect(buildStarterPlan('ppl').routines[0].name).toBe('Push Day')
  })
})
