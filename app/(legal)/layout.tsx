import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { LegalFooter } from '@/components/legal/LegalFooter'

// Public pages (Phase 4): Impressum, Datenschutz, AGB, Kündigung. No Clerk provider, no dashboard shell.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href="/" className="inline-block"><Logo /></Link>
        <main className="mt-8">{children}</main>
        <LegalFooter />
      </div>
    </div>
  )
}
