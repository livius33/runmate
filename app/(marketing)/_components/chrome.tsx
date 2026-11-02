// Header, footer, CTAs and the waitlist form of the marketing pages (Phase 6). Server components; the waitlist is a
// plain HTML form (works without JS). Analytics events ride on data-track attributes (see Analytics).
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { DISCLAIMER_TEXT } from '@/components/legal/Disclaimer'
import type { Dict } from '@/lib/i18n'
import { repoUrl, signUpOpen, SIGN_UP_PATH } from '@/lib/marketing/site'
import { cn } from '@/lib/utils'

const home = (t: Dict) => (t.locale === 'en' ? '/en' : '/')
const pricingPath = (t: Dict) => (t.locale === 'en' ? '/en/pricing' : '/preise')

export function Header({ t }: { t: Dict }) {
  const h = home(t)
  const repo = repoUrl()
  const nav = [
    { href: '/methoden', label: t.nav.methods },
    { href: `${h}#anpassung`, label: t.nav.engine },
    { href: pricingPath(t), label: t.nav.pricing },
    { href: `${h}#faq`, label: t.nav.faq },
  ]
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-4 sm:px-6">
        <Link href={h} aria-label="Runmate" className="shrink-0"><Logo /></Link>
        <nav className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
          {nav.map((n) => <Link key={n.href} href={n.href} className="hover:text-foreground">{n.label}</Link>)}
          {repo && <a href={repo} data-track="github_click" className="hover:text-foreground">{t.nav.github}</a>}
        </nav>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <Link href={t.nav.languageHref} hrefLang={t.locale === 'de' ? 'en' : 'de'} className="text-muted-foreground hover:text-foreground">{t.nav.language}</Link>
          <Link href="/sign-in" className="hidden text-muted-foreground hover:text-foreground sm:inline">{t.nav.signIn}</Link>
          <PrimaryCta t={t} size="sm" />
        </div>
      </div>
    </header>
  )
}

const btn = 'inline-flex items-center justify-center rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

// Trial (billing live) or waitlist (until then). The waitlist CTA jumps to the form at the end of the landing page.
export function PrimaryCta({ t, size = 'md', className }: { t: Dict; size?: 'sm' | 'md'; className?: string }) {
  const open = signUpOpen()
  const cls = cn(btn, 'bg-brand text-white hover:bg-brand/90', size === 'sm' ? 'h-9 px-4 text-sm' : 'h-12 px-6 text-[15px]', className)
  return open
    ? <Link href={SIGN_UP_PATH} data-track="cta_trial" className={cls}>{t.cta.trial}</Link>
    : <a href={`${home(t)}#warteliste`} data-track="cta_waitlist" className={cls}>{t.cta.waitlist}</a>
}

export function SecondaryCta({ t, className }: { t: Dict; className?: string }) {
  const repo = repoUrl()
  const cls = cn(btn, 'h-12 border border-border bg-card px-6 text-[15px] text-foreground hover:bg-secondary', className)
  return repo
    ? <a href={repo} data-track="github_click" className={cls}>{t.cta.github}</a>
    : <Link href="/methoden" className={cls}>{t.cta.methods}</Link>
}

export const ctaNote = (t: Dict) => (signUpOpen() ? t.cta.trialNote : t.cta.waitlistNote)

export function WaitlistForm({ t, className }: { t: Dict; className?: string }) {
  if (signUpOpen()) return <div className={className}><PrimaryCta t={t} /></div>
  return (
    <form id="warteliste" action="/api/waitlist" method="post" className={cn('grid max-w-md gap-2 scroll-mt-24', className)}>
      <input type="hidden" name="locale" value={t.locale} />
      {/* Honeypot: people never see or fill it */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label htmlFor="wl-email" className="text-sm font-medium">{t.waitlist.label}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="wl-email" name="email" type="email" required maxLength={254} autoComplete="email" placeholder={t.waitlist.placeholder}
          className="h-12 min-w-0 flex-1 rounded-full border border-input bg-card px-5 text-[15px] placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <button type="submit" data-track="waitlist_submit" className={cn(btn, 'h-12 bg-brand px-6 text-[15px] text-white hover:bg-brand/90')}>{t.waitlist.submit}</button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{t.waitlist.privacy}</p>
    </form>
  )
}

export function Footer({ t, children }: { t: Dict; children?: React.ReactNode }) {
  const repo = repoUrl()
  return (
    <footer className="border-t border-border">
      {children}
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-12">
        <div className="md:col-span-5">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">{t.footer.tagline}</p>
        </div>
        <nav className="grid content-start gap-2 text-sm md:col-span-3">
          <span className="font-medium">{t.footer.product}</span>
          <Link href="/methoden" className="text-muted-foreground hover:text-foreground">{t.nav.methods}</Link>
          <Link href={pricingPath(t)} className="text-muted-foreground hover:text-foreground">{t.nav.pricing}</Link>
          {repo && <a href={repo} data-track="github_click" className="text-muted-foreground hover:text-foreground">{t.nav.github}</a>}
          <Link href={t.nav.languageHref} hrefLang={t.locale === 'de' ? 'en' : 'de'} className="text-muted-foreground hover:text-foreground">{t.nav.language}</Link>
        </nav>
        <nav className="grid content-start gap-2 text-sm md:col-span-4">
          <span className="font-medium">{t.footer.legal}</span>
          <Link href="/impressum" className="text-muted-foreground hover:text-foreground">{t.footer.impressum}</Link>
          <Link href="/datenschutz" className="text-muted-foreground hover:text-foreground">{t.footer.privacy}</Link>
          <Link href="/agb" className="text-muted-foreground hover:text-foreground">{t.footer.terms}</Link>
          <Link href="/kuendigen" className="text-muted-foreground hover:text-foreground">{t.footer.cancel}</Link>
        </nav>
        <p lang="de" className="text-xs leading-relaxed text-muted-foreground md:col-span-12">{DISCLAIMER_TEXT}</p>
      </div>
    </footer>
  )
}
