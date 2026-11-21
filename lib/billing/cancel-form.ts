// The public cancellation form (§312k BGB, /kuendigen without a session) and its guards (12-05). Nothing proves that
// the sender owns the address, and no mail provider exists yet (12-07), so a request can only do what the owner can
// see and undo:
// - the first request cancels at the end of the paid period, never at once; the owner sees it in Settings → Abo and
//   can take it back there (Paddle: the scheduled change is removed);
// - after a take-back, form requests for that account are held for 90 days: stored and shown to the signed-in owner,
//   who confirms or discards them;
// - at most one form request per account and 24 hours is processed, the rest are dropped.
// The HTTP answer never says which of these happened (app/api/billing/cancel-request). State in settings
// 'billing_cancel_form' (per user, part of the export).
import { getSetting, setSettingJson, compareAndSetSetting, getSettingJson } from '@/lib/db/settings'
import { cancelCurrent, type CancelResult } from './cancel'
import { loadSubscription, clearEntitlementsCache, nowS } from './access'
import { uid } from '@/lib/db/owned'
import { removeScheduledChange } from './paddle'
import { saveCancelled } from './webhook'

export const FORM_KEY = 'billing_cancel_form'
export const CANCELLATION_KEY = 'billing_cancellation'
const DAY = 86_400
export const FORM_COOLDOWN_S = DAY
export const FORM_HOLD_S = 90 * DAY
const MAX_HELD = 10

export type CancelKind = 'ordentlich' | 'ausserordentlich'
export interface HeldRequest { at: number; kind: CancelKind; name: string; reason?: string }
export interface FormState { v: 1; lastAt: number | null; undoneAt: number | null; held: HeldRequest[] }
export interface FormRequest { name: string; kind: CancelKind; reason?: string }

const EMPTY: FormState = { v: 1, lastAt: null, undoneAt: null, held: [] }

// Read-modify-write of the form state with a compare-and-set, so a form request held at the same moment is not
// overwritten by the owner's take-back or decision. `change` null = nothing to write. False when it kept losing.
async function updateFormState(change: (s: FormState) => FormState | null): Promise<boolean> {
  for (let i = 0; i < 5; i++) {
    const raw = await getSetting(FORM_KEY)
    const next = change(parseFormState(raw))
    if (!next) return true
    if (await compareAndSetSetting(FORM_KEY, raw, JSON.stringify(next))) return true
  }
  return false
}

export function parseFormState(raw: string | null): FormState {
  try {
    const v = raw ? JSON.parse(raw) : null
    if (v?.v !== 1) return EMPTY
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
    return { v: 1, lastAt: num(v.lastAt), undoneAt: num(v.undoneAt), held: Array.isArray(v.held) ? v.held.slice(-MAX_HELD) : [] }
  } catch { return EMPTY }
}

export type FormDecision = 'cancel' | 'hold' | 'cooldown'

// What a form request does now. Pure.
export function formDecision(s: FormState, now: number): FormDecision {
  if (s.lastAt != null && now - s.lastAt < FORM_COOLDOWN_S) return 'cooldown'
  if (s.undoneAt != null && now - s.undoneAt < FORM_HOLD_S) return 'hold'
  return 'cancel'
}

export type FormOutcome = FormDecision | 'failed'

// Where the confirmation mail to the account's own address goes once 12-07 has a mailer: every form request with a
// known account passes here, whatever its outcome. Sends nothing today.
export async function sendCancellationMail(_userId: string, _outcome: FormOutcome, _at: number): Promise<void> {}

// One form request for the account whose scope this is. The slot is claimed with a compare-and-set first, so two
// requests at once cannot both reach Paddle. Throws when Paddle refused (the route answers 502 for every address then).
export async function handleFormRequest(req: FormRequest, at = nowS()): Promise<{ outcome: FormDecision; subscriptionId: string | null }> {
  const raw = await getSetting(FORM_KEY)
  const state = parseFormState(raw)
  const decision = formDecision(state, at)
  const subscriptionId = (await loadSubscription())?.paddleSubscriptionId ?? null
  if (decision === 'cooldown') return { outcome: 'cooldown', subscriptionId }
  const next: FormState = decision === 'hold'
    ? { ...state, lastAt: at, held: [...state.held, { at, ...req }].slice(-MAX_HELD) }
    : { ...state, lastAt: at }
  if (!(await compareAndSetSetting(FORM_KEY, raw, JSON.stringify(next)))) return { outcome: 'cooldown', subscriptionId }
  if (decision === 'hold') return { outcome: 'hold', subscriptionId }
  let r: CancelResult | null = null
  try {
    r = await cancelCurrent('next_billing_period')
  } finally {
    // Paddle did not confirm (refused, or anything threw): give the slot back, so the retry is not swallowed by the
    // cooldown. Only while the state is still the one written here; a newer one is left alone.
    if (!r?.ok) await compareAndSetSetting(FORM_KEY, JSON.stringify(next), JSON.stringify({ ...next, lastAt: state.lastAt })).catch(() => false)
  }
  if (!r.ok) throw new Error('paddle')
  await recordCancellation(req, r, true)
  return { outcome: 'cancel', subscriptionId }
}

async function recordCancellation(req: FormRequest, r: Extract<CancelResult, { ok: true }>, viaForm: boolean) {
  await setSettingJson(CANCELLATION_KEY, { kind: req.kind, reason: req.reason, name: req.name, at: r.at, endsAt: 'endsAt' in r ? r.endsAt : null, viaForm })
}

export interface StoredCancellation { kind: CancelKind; at: number; endsAt: number | null; viaForm?: boolean; revokedAt?: number }

// Settings → Abo: the cancellation on record and the held form requests.
export async function cancellationInfo(): Promise<{ cancellation: StoredCancellation | null; held: { at: number; kind: CancelKind }[] }> {
  const [c, raw] = await Promise.all([getSettingJson<StoredCancellation>(CANCELLATION_KEY), getSetting(FORM_KEY)])
  return {
    cancellation: c && !c.revokedAt ? c : null,
    held: parseFormState(raw).held.map(({ at, kind }) => ({ at, kind })),
  }
}

export type UndoResult = { ok: true; periodEnd: number | null } | { ok: false; status: number; error: string }

// "Kündigung zurücknehmen": the signed-in owner removes the scheduled cancellation. From now on the form only holds
// requests for this account (90 days).
export async function undoCancellation(at = nowS()): Promise<UndoResult> {
  const row = await loadSubscription()
  const live = row?.paddleSubscriptionId && row.status !== 'canceled' && row.cancelAtPeriodEnd && (row.currentPeriodEnd == null || row.currentPeriodEnd > at)
  if (!row?.paddleSubscriptionId || !live) return { ok: false, status: 409, error: 'Es ist keine Kündigung vorgemerkt, die sich zurücknehmen lässt.' }
  try {
    const s = await removeScheduledChange(row.paddleSubscriptionId)
    const next = await saveCancelled(s)
    clearEntitlementsCache()
    await updateFormState((s) => ({ ...s, undoneAt: at }))
    const c = await getSettingJson<StoredCancellation>(CANCELLATION_KEY)
    if (c) await setSettingJson(CANCELLATION_KEY, { ...c, revokedAt: at })
    console.info('[billing/cancel-undo] user=%s subscription=%s', row.userId, row.paddleSubscriptionId)
    return { ok: true, periodEnd: next?.currentPeriodEnd ?? row.currentPeriodEnd }
  } catch (err: any) {
    console.error('[billing/cancel-undo] user=%s subscription=%s failed: %s', row.userId, row.paddleSubscriptionId, err?.message)
    return { ok: false, status: 502, error: 'Die Rücknahme konnte gerade nicht an den Zahlungsanbieter übermittelt werden. Bitte versuche es gleich noch einmal.' }
  }
}

export type HeldResult = { ok: true; cancelled: CancelResult | null } | { ok: false; status: number; error: string }

// The owner decides about the held form requests: confirm = cancel at the end of the paid period, discard = drop them.
export async function resolveHeld(action: 'confirm' | 'discard'): Promise<HeldResult> {
  const raw = await getSetting(FORM_KEY)
  const state = parseFormState(raw)
  if (!state.held.length) return { ok: false, status: 409, error: 'Es liegt keine offene Kündigung vor.' }
  let cancelled: CancelResult | null = null
  if (action === 'confirm') {
    cancelled = await cancelCurrent('next_billing_period')
    if (!cancelled.ok) return { ok: false, status: 502, error: cancelled.error }
    const last = state.held[state.held.length - 1]
    await recordCancellation(last, cancelled, true)
  }
  // Only the requests decided on here; one held meanwhile stays for the owner.
  const decided = new Set(state.held.map((h) => h.at))
  await updateFormState((s) => ({ ...s, held: s.held.filter((h) => !decided.has(h.at)) }))
  console.info('[billing/cancel-held] user=%s action=%s requests=%d', uid(), action, state.held.length)
  return { ok: true, cancelled }
}
