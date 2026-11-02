'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays, ChartLine, Flag, Footprints, MoreHorizontal, Settings, SlidersHorizontal, Sun, Trophy, X, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { HeaderSync } from '@/components/HeaderSync'
import { HeaderDate } from '@/components/HeaderDate'
import { Logo } from '@/components/Logo'
import { useAppBase, useAppHref, useAppPath } from '@/components/AppBase'

type Item = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean }

// The pages, grouped; `match` decides when a link counts as active.
const NAV: { area: string; label: string; items: Item[] }[] = [
  {
    area: 'training', label: 'Training', items: [
      { href: '/plan', label: 'Plan', icon: CalendarDays, match: (p) => p === '/plan' },
      { href: '/plan/anpassen', label: 'Plan anpassen', icon: SlidersHorizontal, match: (p) => p.startsWith('/plan/anpassen') },
      { href: '/running/activities', label: 'Läufe', icon: Footprints, match: (p) => p.startsWith('/running/activities') },
      { href: '/running', label: 'Analyse', icon: ChartLine, match: (p) => p === '/running' },
      { href: '/season', label: 'Saison', icon: Trophy, match: (p) => p.startsWith('/season') },
      { href: '/race', label: 'Renntag', icon: Flag, match: (p) => p.startsWith('/race') },
    ],
  },
]
const SETTINGS: Item = { href: '/settings', label: 'Einstellungen', icon: Settings, match: (p) => p.startsWith('/settings') }

function titleOf(path: string) {
  return [...NAV.flatMap((g) => g.items), SETTINGS].find((i) => i.match(path))?.label ?? 'Runmate'
}

// Desktop: a sidebar next to a slim top bar (page title, sync).
export function AppSidebar() {
  const path = useAppPath()
  const href = useAppHref()
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
      <Link href={href('/plan')} aria-label="Runmate" className="flex h-14 items-center px-5"><Logo /></Link>
      <NavList path={path} />
      <div className="px-5 pb-4"><HeaderDate className="block" /></div>
    </aside>
  )
}

// Top bar on every size; on phones it also holds the menu button that opens the same list as the sidebar.
export function AppHeader() {
  const path = useAppPath()
  const { readOnly } = useAppBase()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [path])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <header className="sticky top-0 z-[1000] border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <h1 className="truncate text-sm font-semibold">{titleOf(path)}</h1>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {!readOnly && <HeaderSync />}
          </div>
        </div>
      </header>

      <MobileTabBar path={path} onMore={() => setOpen(true)} moreOpen={open} />

      {/* Outside <header>: its backdrop-blur would make `fixed` relative to the header instead of the screen */}
      {open && (
        <div className="fixed inset-0 z-[1100] md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button aria-label="Schließen" onClick={() => setOpen(false)} className="absolute inset-0 bg-foreground/30" />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-card shadow-xl">
            <div className="flex h-14 items-center justify-between px-5">
              <Logo />
              <button onClick={() => setOpen(false)} aria-label="Schließen" className="tap -mr-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList path={path} />
            <div className="px-5 pb-5"><HeaderDate className="block" /></div>
          </div>
        </div>
      )}
    </>
  )
}

// Phones (09-01): bottom tabs for the daily pages; "Mehr" opens the full navigation (Plan anpassen, Renntag, Einstellungen).
const TABS: Item[] = [
  { href: '/plan', label: 'Heute', icon: Sun, match: (p) => p === '/plan' },
  { href: '/running/activities', label: 'Läufe', icon: Footprints, match: (p) => p.startsWith('/running/activities') },
  { href: '/running', label: 'Analyse', icon: ChartLine, match: (p) => p === '/running' },
  { href: '/season', label: 'Saison', icon: Trophy, match: (p) => p.startsWith('/season') },
]

function MobileTabBar({ path, onMore, moreOpen }: { path: string; onMore: () => void; moreOpen: boolean }) {
  const to = useAppHref()
  const onTab = TABS.some((t) => t.match(path))
  const cls = (active: boolean) => cn('tap flex min-w-0 flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px]',
    active ? 'font-medium text-brand' : 'text-muted-foreground')
  return (
    <nav aria-label="Hauptnavigation" className="fixed inset-x-0 bottom-0 z-[1000] flex border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
      {TABS.map(({ href, label, icon: Icon, match }) => (
        <Link key={href} href={to(href)} aria-current={match(path) ? 'page' : undefined} className={cls(match(path))}>
          <Icon className="h-5 w-5" />{label}
        </Link>
      ))}
      <button onClick={onMore} aria-expanded={moreOpen} className={cls(!onTab || moreOpen)}>
        <MoreHorizontal className="h-5 w-5" />Mehr
      </button>
    </nav>
  )
}

function NavList({ path }: { path: string }) {
  const { readOnly } = useAppBase()
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-2">
      {NAV.map((g) => (
        <div key={g.area} className="grid gap-0.5">
          <span className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{g.label}</span>
          {g.items.map((i) => <NavLink key={i.href} item={i} path={path} />)}
        </div>
      ))}
      {!readOnly && <div className="mt-auto grid border-t border-border pt-3"><NavLink item={SETTINGS} path={path} /></div>}
    </nav>
  )
}

function NavLink({ item: { href, label, icon: Icon, match }, path }: { item: Item; path: string }) {
  const to = useAppHref()
  const active = match(path)
  return (
    <Link href={to(href)} aria-current={active ? 'page' : undefined}
      className={cn('flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors md:py-1.5',
        active ? 'bg-brand-soft font-medium text-brand' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}>
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  )
}
