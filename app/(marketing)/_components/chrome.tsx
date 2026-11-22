// Header, footer, CTAs and the waitlist form of the marketing pages (Phase 6). Server components; the waitlist is a
// plain HTML form (works without JS). Analytics events ride on data-track attributes (see Analytics).
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { DISCLAIMER_TEXT } from '@/components/legal/Disclaimer'
import type { Dict } from '@/lib/i18n'
import { repoUrl, signUpOpen, SIGN_UP_PATH } from '@/lib/marketing/site'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/field'

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
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-4 px-4 sm:px-6 md:gap-8">
        <Link href={h} aria-label="Runmate" className="shrink-0"><Logo /></Link>
        <nav className="hidden items-center gap-6 text-body-sm text-muted-foreground md:flex">
          {nav.map((n) => <Link key={n.href} href={n.href} className="hover:text-foreground">{n.label}</Link>)}
          {repo && <a href={repo} data-track="github_click" className="hover:text-foreground">{t.nav.github}</a>}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-body-sm sm:gap-5">
          <Link href={t.nav.languageHref} hrefLang={t.locale === 'de' ? 'en' : 'de'} className="text-muted-foreground hover:text-foreground">{t.nav.language}</Link>
          <Link href="/sign-in" className="hidden text-muted-foreground hover:text-foreground sm:inline">{t.nav.signIn}</Link>
          <PrimaryCta t={t} size="sm" />
        </div>
      </div>
    </header>
  )
}

// DESIGN.md buttons in the in-app shape (rounded.sm, 6 px), so the marketing pages and the app share one button. `md`
// is the page CTA (44 px at every width); `sm` sits in the header: 44 px on phones, 36 px from sm up, and in the
// secondary style, so the page itself keeps one ink action per view.
const CTA = {
  md: cn(buttonVariants({ variant: 'primary' }), 'h-11 px-5 text-body sm:h-11 sm:px-5'),
  sm: buttonVariants({ variant: 'secondary', size: 'md' }),
}

// Trial (billing live) or waitlist (until then). The waitlist CTA jumps to the form at the end of the landing page.
export function PrimaryCta({ t, size = 'md', className }: { t: Dict; size?: 'sm' | 'md'; className?: string }) {
  const open = signUpOpen()
  const cls = cn(CTA[size], className)
  return open
    ? <Link href={SIGN_UP_PATH} data-track="cta_trial" className={cls}>{t.cta.trial}</Link>
    : <a href={`${home(t)}#warteliste`} data-track="cta_waitlist" className={cls}>{t.cta.waitlist}</a>
}

export function SecondaryCta({ t, className }: { t: Dict; className?: string }) {
  const repo = repoUrl()
  const cls = cn(buttonVariants({ variant: 'secondary' }), 'h-11 px-5 text-body sm:h-11 sm:px-5', className)
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
      <label htmlFor="wl-email" className="text-body-sm font-medium">{t.waitlist.label}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id="wl-email" name="email" type="email" required maxLength={254} autoComplete="email" placeholder={t.waitlist.placeholder}
          className="h-11 w-full min-w-0 text-body sm:flex-1" />
        <button type="submit" data-track="waitlist_submit" className={CTA.md}>{t.waitlist.submit}</button>
      </div>
      <p className="text-caption text-muted-foreground">{t.waitlist.privacy}</p>
    </form>
  )
}

export function Footer({ t, children }: { t: Dict; children?: React.ReactNode }) {
  const repo = repoUrl()
  return (
    <footer className="border-t border-border">
      {children}
      <div className={cn('mx-auto grid max-w-[1200px] gap-8 px-4 py-12 sm:px-6 md:grid-cols-12', children ? 'border-t border-border' : undefined)}>
        <div className="md:col-span-5">
          <Logo />
          <p className="mt-3 max-w-sm text-body-sm text-muted-foreground">{t.footer.tagline}</p>
        </div>
        <nav className="grid content-start gap-2 text-body-sm md:col-span-3">
          <span className="font-mono text-caption uppercase text-muted-foreground">{t.footer.product}</span>
          <Link href="/methoden" className={FOOT}>{t.nav.methods}</Link>
          <Link href={pricingPath(t)} className={FOOT}>{t.nav.pricing}</Link>
          {repo && <a href={repo} data-track="github_click" className={FOOT}>{t.nav.github}</a>}
          <Link href={t.nav.languageHref} hrefLang={t.locale === 'de' ? 'en' : 'de'} className={FOOT}>{t.nav.language}</Link>
        </nav>
        <nav className="grid content-start gap-2 text-body-sm md:col-span-4">
          <span className="font-mono text-caption uppercase text-muted-foreground">{t.footer.legal}</span>
          <Link href="/impressum" className={FOOT}>{t.footer.impressum}</Link>
          <Link href="/datenschutz" className={FOOT}>{t.footer.privacy}</Link>
          <Link href="/agb" className={FOOT}>{t.footer.terms}</Link>
          <Link href="/kuendigen" className={FOOT}>{t.footer.cancel}</Link>
        </nav>
        <p lang="de" className="max-w-[90ch] text-caption text-muted-foreground md:col-span-12">{DISCLAIMER_TEXT}</p>
      </div>
    </footer>
  )
}

const FOOT = 'justify-self-start text-muted-foreground hover:text-foreground'
