import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

// Design tokens (12-02), after DESIGN.md (type scale, radius, elevation; Runmate keeps its own colours).
//
// Type scale — one place for the mapping. Named steps, so a migrated file never mixes them with Tailwind's own sizes
// (tests/design/tokens.test.ts holds migrated files to these names):
//   text-caption   12 / 16  ·  0         typography.caption (with font-mono + uppercase: caption-mono eyebrows)
//   text-body-sm   14 / 20  · −0.28 px   typography.body-sm (font-medium: body-sm-strong, button-md)
//   text-body      16 / 24  ·  0         typography.body-md (font-medium: body-md-strong, button-lg)
//   text-title-sm  20 / 28  · −0.6 px  · 600   typography.display-sm
//   text-title     24 / 32  · −0.96 px · 600   typography.display-md
//   text-display   32 / 40  · −1.28 px · 600   typography.display-lg
//   text-hero      48 / 48  · −2.4 px  · 600   typography.display-xl — marketing pages only
// Weight ceiling 600 (font-semibold); nothing bolder. Figures keep `tabular-nums`.
//
// Radius: rounded-control 6 px (buttons, inputs, chips) · rounded-card 8 px · rounded-dialog 12 px (dialogs, sheets) ·
// rounded-full only for dots, avatars and switches. The old rounded-lg/md/sm stay on --radius until every page moved.
//
// Elevation: shadow-hairline · shadow-raised · shadow-overlay — stacked small offsets plus a hairline ring, never one
// heavy drop. The ring uses --border, so the dark set follows.
const RING = 'inset 0 0 0 1px hsl(var(--border))'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // `text` (12-02, AC-6): brand red / teal as text colour; DEFAULT and soft stay for marks and fills
        brand: { DEFAULT: 'hsl(var(--brand))', soft: 'hsl(var(--brand-soft))', text: 'hsl(var(--brand-text))' },
        // DESIGN.md colors.warning-deep / warning-soft (text, soft fill, border); replaces the amber classes
        warning: { DEFAULT: 'hsl(var(--warning))', soft: 'hsl(var(--warning-soft))', border: 'hsl(var(--warning-border))' },
        // DESIGN.md colors.error: error text (the destructive fill stays `destructive`)
        error: 'hsl(var(--error))',
        teal: { DEFAULT: 'hsl(var(--teal))', soft: 'hsl(var(--teal-soft))', text: 'hsl(var(--teal-text))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        // DESIGN.md typography: Geist for text, Geist Mono only for uppercase eyebrow labels (app/layout.tsx loads both)
        sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
        mono: ['var(--font-mono)', ...defaultTheme.fontFamily.mono],
        display: ['var(--font-display)', 'var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        caption: ['12px', { lineHeight: '16px' }],                                                  // typography.caption
        'body-sm': ['14px', { lineHeight: '20px', letterSpacing: '-0.28px' }],                       // typography.body-sm
        body: ['16px', { lineHeight: '24px' }],                                                      // typography.body-md
        'title-sm': ['20px', { lineHeight: '28px', letterSpacing: '-0.6px', fontWeight: '600' }],    // typography.display-sm
        title: ['24px', { lineHeight: '32px', letterSpacing: '-0.96px', fontWeight: '600' }],        // typography.display-md
        display: ['32px', { lineHeight: '40px', letterSpacing: '-1.28px', fontWeight: '600' }],      // typography.display-lg
        hero: ['48px', { lineHeight: '48px', letterSpacing: '-2.4px', fontWeight: '600' }],          // typography.display-xl
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        control: '6px',   // rounded.sm — buttons, inputs, chips
        card: '8px',      // rounded.md — cards
        dialog: '12px',   // rounded.lg — dialogs and sheets
      },
      boxShadow: {
        hairline: RING,                                                                              // Level 1 — Inset Hairline
        raised: `0 1px 1px rgb(0 0 0 / 0.02), 0 2px 2px rgb(0 0 0 / 0.04), ${RING}`,                 // Level 2 — Subtle Drop
        overlay: `0 1px 1px rgb(0 0 0 / 0.02), 0 8px 16px -4px rgb(0 0 0 / 0.04), 0 24px 32px -8px rgb(0 0 0 / 0.06), ${RING}`, // Level 5 — Modal
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
