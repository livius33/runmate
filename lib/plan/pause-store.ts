// Krank/Pause periods (07-08), stored in settings 'plan_pauses'.
import { getSettingJson, setSettingJson } from '@/lib/db/settings'
import { storedPauses, type Pause } from './pause'

const KEY = 'plan_pauses'

export async function loadPauses(): Promise<Pause[]> {
  const raw = await getSettingJson<unknown>(KEY)
  return raw == null ? [] : storedPauses(raw)
}

export async function savePauses(pauses: Pause[]) {
  await setSettingJson(KEY, [...pauses].sort((a, b) => a.from.localeCompare(b.from)))
}
