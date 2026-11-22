// Building blocks of the legal templates (Phase 4). Every value only the operator knows is a visible placeholder —
// never invented. `grep -rn "PLATZHALTER" app/(legal)` lists what is left to fill in.

// "[PLATZHALTER: …]", highlighted.
export function Ph({ children }: { children: React.ReactNode }) {
  return <mark className="rounded-[4px] bg-warning-soft px-1 text-warning">[PLATZHALTER: {children}]</mark>
}

export const REVIEW_NOTE = 'Vorlage – vor dem Livegang juristisch prüfen'

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="legal grid gap-3 text-body-sm [&_a]:underline-offset-2 [&_a:hover]:text-muted-foreground [&_h2]:mt-6 [&_h2]:text-body [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-medium [&_li]:ml-5 [&_li]:list-disc [&_ol>li]:list-decimal">
      <p role="note" className="justify-self-start rounded-control border border-warning-border bg-warning-soft px-3 py-1.5 text-caption font-medium text-warning">{REVIEW_NOTE}</p>
      <h1 className="mt-2 text-title">{title}</h1>
      <p className="-mt-2 text-caption text-muted-foreground">Stand: {updated}</p>
      {children}
    </article>
  )
}
