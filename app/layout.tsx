import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

// DESIGN.md typography (12-02): Geist for text, Geist Mono only for uppercase eyebrow labels (`font-mono`: sidebar group heading, weekdays). Both SIL OFL.
const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'Runmate',
  description: 'Trainingsplan, Läufe und Analyse',
  appleWebApp: { capable: true, title: 'Runmate', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
}

// Installed app (09-01): brand-red status bar, content under the notch / home indicator handled by safe-area padding.
export const viewport: Viewport = { themeColor: '#E5484D', viewportFit: 'cover' }

// ClerkProvider lives in the dashboard and sign-in layouts (Phase 4), React Query in the dashboard layout (Phase 6):
// the public pages (landing, methods, Impressum, Datenschutz, AGB, Kündigung) load neither.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${sans.variable} ${mono.variable}`}>
      <body>
        {children}
      </body>
    </html>
  )
}
