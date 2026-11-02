import { ImageResponse } from 'next/og'
import type { Dict } from '@/lib/i18n'

// The OG image (Phase 6): headline and a week strip, plan (outline) vs. run (teal). Rendered at build time.
export const OG_SIZE = { width: 1200, height: 630 }
const WEEK = [[9, 9.2], [11, 11.4], [8, 8.4], [12, 12.1], [0, 0], [18, 18.3], [6, 6.1]]
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export function ogImage(t: Dict) {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#F3F4F6', color: '#181D29', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 600 }}>
          <svg width="48" height="48" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="8" fill="#E5484D" />
            <path d="M7.5 23c4 0 4.5-6.5 8.5-6.5s4.5-6 8-6" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            <circle cx="24" cy="10.5" r="3" fill="#fff" />
          </svg>
          Runmate
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 76, fontWeight: 700, lineHeight: 1, letterSpacing: -3 }}>
            <span>{t.hero.line1}</span>
            <span style={{ color: '#6B7280' }}>{t.hero.line2}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', background: '#fff', borderRadius: 24, padding: 28, border: '1px solid #E2E4E9' }}>
            {WEEK.map(([plan, run], i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative', width: 34, height: 180, display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ position: 'absolute', bottom: 0, width: 34, height: Math.max(4, plan * 9.5), borderRadius: 5, border: '2px dashed #C9CDD5', background: '#F1F2F4' }} />
                  {run > 0 && <div style={{ position: 'absolute', bottom: 0, left: 5, width: 24, height: run * 9.5, borderRadius: 5, background: '#19A090' }} />}
                </div>
                <span style={{ fontSize: 20, color: '#6B7280' }}>{DAYS[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  )
}
