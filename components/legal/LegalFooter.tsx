import Link from 'next/link'
import { Disclaimer } from './Disclaimer'

const LINKS = [
  { href: '/impressum', label: 'Impressum' },
  { href: '/datenschutz', label: 'Datenschutz' },
  { href: '/agb', label: 'AGB' },
  { href: '/kuendigen', label: 'Verträge hier kündigen' },
]

export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav className={`flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground ${className ?? ''}`}>
      {LINKS.map((l) => <Link key={l.href} href={l.href} className="underline-offset-2 hover:text-foreground hover:underline">{l.label}</Link>)}
    </nav>
  )
}

export function LegalFooter() {
  return (
    <footer className="mt-16 grid gap-3 border-t border-border pt-6">
      <LegalLinks />
      <Disclaimer />
    </footer>
  )
}
