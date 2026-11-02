import { Inter_Tight } from 'next/font/google'

// Marketing pages (Phase 6): static, no Clerk, no React Query. The display face is Inter Tight (headlines and the big
// figures); body text stays the app's Inter. `.theme-auto` follows the system's dark preference (globals.css).
const display = Inter_Tight({ subsets: ['latin'], weight: ['600'], variable: '--font-display', display: 'swap' })

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`theme-auto min-h-screen bg-background text-foreground ${display.variable}`}>{children}</div>
}
