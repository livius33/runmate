// Building blocks of the legal templates (Phase 4). Every value only the operator knows is a visible placeholder —
// never invented. `grep -rn "PLATZHALTER" app/(legal)` lists what is left to fill in.

// "[PLATZHALTER: …]", highlighted.
export function Ph({ children }: { children: React.ReactNode }) {
  return <mark className="rounded bg-amber-100 px-1 text-amber-900">[PLATZHALTER: {children}]</mark>
}

export const REVIEW_NOTE = 'Vorlage – vor dem Livegang juristisch prüfen'

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="legal grid gap-4 text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-medium [&_li]:ml-5 [&_li]:list-disc [&_ol>li]:list-decimal">
      <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900">{REVIEW_NOTE}</p>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-xs text-muted-foreground">Stand: {updated}</p>
      {children}
    </article>
  )
}
