// Run feedback store (07-25): what is stored, how a patch changes an entry, what the contract requires.
import { describe, expect, it } from 'vitest'
import { EMPTY_RUN_FEEDBACK, storedRunFeedback, withEntry, type RunFeedbackStore } from '@/lib/feedback/run'

const at = '2026-11-01T10:00:00.000Z'
const store: RunFeedbackStore = { v: 1, byActivity: { a: { feel: 4, pain: 'none', at } } }

describe('run_feedback: Ablage', () => {
  it('liest nur vollständige Einträge (feel + pain + at), kürzt Notizen', () => {
    const raw = { v: 1, byActivity: {
      ok: { feel: 3, pain: 'light', note: '  Wade zieht  ', at },
      noFeel: { pain: 'none', at }, badPain: { feel: 2, pain: 'much', at }, noAt: { feel: 2, pain: 'none' },
      long: { feel: 5, pain: 'none', note: 'x'.repeat(400), at },
    } }
    const s = storedRunFeedback(raw)
    expect(Object.keys(s.byActivity).sort()).toEqual(['long', 'ok'])
    expect(s.byActivity.ok).toEqual({ feel: 3, pain: 'light', note: 'Wade zieht', at })
    expect(s.byActivity.long.note).toHaveLength(280)
    expect(storedRunFeedback(null)).toEqual(EMPTY_RUN_FEEDBACK)
    expect(storedRunFeedback({ v: 1 })).toEqual(EMPTY_RUN_FEEDBACK)
  })

  it('Gefühl zuerst: Schmerzen/Notiz ohne Gefühl werden nicht gespeichert', () => {
    expect(withEntry(EMPTY_RUN_FEEDBACK, 'b', { pain: 'stop' }, at)).toBeNull()
    expect(withEntry(EMPTY_RUN_FEEDBACK, 'b', { note: 'hm' }, at)).toBeNull()
    expect(withEntry(EMPTY_RUN_FEEDBACK, 'b', { feel: 2, pain: 'stop' }, at)).toEqual({ v: 1, byActivity: { b: { feel: 2, pain: 'stop', at } } })
  })

  it('Patch: Schmerzen ohne Angabe = keine, null löscht ein Feld, Gefühl null löscht den Eintrag', () => {
    const t2 = '2026-11-01T11:00:00.000Z'
    expect(withEntry(EMPTY_RUN_FEEDBACK, 'b', { feel: 3 }, at)!.byActivity.b).toEqual({ feel: 3, pain: 'none', at })
    const withNote = withEntry(store, 'a', { note: 'schwer' }, t2)!
    expect(withNote.byActivity.a).toEqual({ feel: 4, pain: 'none', note: 'schwer', at: t2 })
    expect(withEntry(withNote, 'a', { note: null }, t2)!.byActivity.a).toEqual({ feel: 4, pain: 'none', at: t2 })
    expect(withEntry(withNote, 'a', { pain: 'light' }, t2)!.byActivity.a).toMatchObject({ pain: 'light', note: 'schwer' })
    expect(withEntry(store, 'a', { feel: null }, t2)).toEqual(EMPTY_RUN_FEEDBACK)
    expect(withEntry(store, 'b', { feel: 1 }, t2)!.byActivity).toEqual({ a: store.byActivity.a, b: { feel: 1, pain: 'none', at: t2 } })
  })
})
