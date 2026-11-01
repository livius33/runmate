// App icons for the installable web app (09-01): the Runmate mark (app/icon.svg) as PNGs.
//   node scripts/make-icons.mjs   → public/icons/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const RED = '#E5484D'   // hsl(var(--brand)) = 358 75% 59%
// `pad`: share of the canvas kept free around the mark (maskable icons are cropped to a circle by Android).
const svg = (pad, rounded) => {
  const s = 32 * (1 - 2 * pad)
  const o = 32 * pad
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${rounded ? 7 : 0}" fill="${RED}"/>
  <g transform="translate(${o} ${o}) scale(${s / 32})">
    <path d="M7.5 23c4 0 4.5-6.5 8.5-6.5s4.5-6 8-6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    <circle cx="7.5" cy="23" r="2" fill="${RED}" stroke="#fff" stroke-width="1.6"/>
    <circle cx="24" cy="10.5" r="3" fill="#fff"/>
  </g>
</svg>`
}

mkdirSync('public/icons', { recursive: true })
const out = [
  ['icon-192.png', 192, svg(0.06, true)],
  ['icon-512.png', 512, svg(0.06, true)],
  ['icon-maskable-512.png', 512, svg(0.18, false)],
  ['apple-touch-icon.png', 180, svg(0.1, false)],    // iOS rounds the corners itself
]
for (const [name, size, s] of out) {
  await sharp(Buffer.from(s)).resize(size, size).png().toFile(`public/icons/${name}`)
  console.log(`public/icons/${name}`)
}
