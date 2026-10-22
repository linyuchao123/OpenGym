import { descFor, getLang, instrFor, instrTranslated, t, useLang } from '../lib/i18n.js'
import { isCustomEx } from '../lib/exercises.js'

// The upstream catalogue has Chinese names for every exercise, but only some steps and
// no Chinese description pack. Keep the original available without presenting it as translated.
export function ExerciseDescription({ ex }) {
  useLang()
  const description = descFor(ex)
  if (!description) return null
  if (getLang() === 'zh' && !isCustomEx(ex)) return <details className="exnote">
    <summary>动作简介（英文原文，可选查看）</summary>
    <p lang="en">{description}</p>
  </details>
  return <div className="exnote">{description}</div>
}

export function ExerciseInstructions({ ex }) {
  useLang()
  const steps = instrFor(ex)
  const translated = instrTranslated(ex)
  const list = <ol className="steps-list">{steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
  if (getLang() === 'zh' && !translated && !isCustomEx(ex)) return <>
    <h4 className="sec">动作步骤</h4>
    <p className="small muted">这个动作暂未提供中文步骤，可先查看动作演示。</p>
    {steps.length > 0 && <details className="exnote"><summary>查看英文步骤原文</summary><div lang="en">{list}</div></details>}
  </>
  if (!steps.length) return null
  return <><h4 className="sec">{t('How to')}{getLang() !== 'en' && !translated && <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}> · {t('instructions in English')}</span>}</h4>{list}</>
}
