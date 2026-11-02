// The Art. 9 GDPR consent text for health data (Phase 4). Isomorphic: Settings shows it, the server stores which version
// was agreed to. A changed meaning needs a new version (users are asked again); typo fixes do not.
export const HEALTH_CONSENT_VERSION = '2026-11-02'

export const HEALTH_CONSENT_TEXT = [
  'Ich willige ausdrücklich ein, dass Runmate meine Gesundheitsdaten verarbeitet: Herzfrequenz (auch in Läufen), Herzfrequenzvariabilität (HRV), Ruhepuls, Schlaf und Körpergewicht, soweit ich sie über eine Datenquelle oder einen Datei-Import bereitstelle.',
  'Zweck ist allein, meine Trainingsbelastung auszuwerten und meinen Trainingsplan darauf abzustimmen (Art. 9 Abs. 2 lit. a DSGVO). Die Daten werden nicht verkauft, nicht für Werbung genutzt und nicht an Dritte weitergegeben, außer an die in der Datenschutzerklärung genannten Auftragsverarbeiter.',
  'Die Einwilligung ist freiwillig. Ich kann sie jederzeit in den Einstellungen widerrufen; ab dann werden keine neuen Daten mehr verarbeitet, und ich kann die gespeicherten Daten löschen. Der Widerruf berührt nicht die Rechtmäßigkeit der Verarbeitung bis dahin.',
]

export interface HealthConsentStatus {
  required: boolean                // false on a self-hosted install (lib/billing/config.ts healthConsentRequired)
  granted: boolean                 // in force for the current version (always true when not required)
  version: string | null           // the version agreed to
  grantedAt: number | null         // epoch seconds
  revokedAt: number | null
  current: string                  // HEALTH_CONSENT_VERSION
  text: string[]
}
