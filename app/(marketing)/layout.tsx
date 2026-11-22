// Marketing pages (Phase 6): static, no Clerk, no React Query. Geist throughout, as in the app (DESIGN.md typography).
// `.theme-auto` follows the system's dark preference (globals.css).

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="theme-auto min-h-screen bg-background text-foreground">{children}</div>
}
