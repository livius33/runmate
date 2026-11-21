import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The design tokens' own class names (tailwind.config.ts), so `cn` merges them as sizes, radii and shadows instead of
// reading `text-caption` as a colour and dropping it next to `text-muted-foreground`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['caption', 'body-sm', 'body', 'title-sm', 'title', 'display', 'hero'] }],
      rounded: [{ rounded: ['control', 'card', 'dialog'] }],
      shadow: [{ shadow: ['hairline', 'raised', 'overlay'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatEUR(value: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatPct(value: number) {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function today() {
  return new Date().toISOString().split('T')[0]
}
