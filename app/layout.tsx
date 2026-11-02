import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Runmate',
  description: 'Trainingsplan, Läufe und Analyse',
  appleWebApp: { capable: true, title: 'Runmate', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
}

// Installed app (09-01): brand-red status bar, content under the notch / home indicator handled by safe-area padding.
export const viewport: Viewport = { themeColor: '#E5484D', viewportFit: 'cover' }

// ClerkProvider lives in the dashboard and sign-in layouts (Phase 4): the public pages (Impressum, Datenschutz, AGB,
// Kündigung) load no Clerk JS.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
