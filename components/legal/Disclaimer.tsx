// "Kein Medizinprodukt" (Phase 4, MDR): shown on the legal pages, the sign-in page and in Settings. Server component.
export const DISCLAIMER_TEXT =
  'Runmate ist ein Trainings- und Freizeitwerkzeug und kein Medizinprodukt. Pläne, Hinweise und Prognosen sind ' +
  'Trainingsvorschläge aus veröffentlichten Methoden und deinen Daten; sie stellen keine Diagnose, ersetzen keine ' +
  'ärztliche Beratung und versprechen kein gesundheitliches oder sportliches Ergebnis. Bei Schmerzen, Beschwerden ' +
  'oder Unsicherheit: Training unterbrechen und ärztlichen Rat einholen.'

export function Disclaimer({ className }: { className?: string }) {
  return <p className={`text-caption text-muted-foreground ${className ?? ''}`}>{DISCLAIMER_TEXT}</p>
}
