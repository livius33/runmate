// Design-token scanner for tests/design/tokens.test.ts (12-02): finds classes and values outside the token set.

export type Rule = 'px-font' | 'type-scale' | 'weight' | 'radius' | 'shadow' | 'palette' | 'hex'

export const RULES: Record<Rule, { re: RegExp; why: string }> = {
  // text-[11px], text-[0.8rem], text-[clamp(…)]: use the named steps of the type scale
  'px-font': { re: /(?<![\w-])text-\[(?:[\d.]+(?:px|r?em)|clamp\()/g, why: 'font size outside the type scale' },
  // Tailwind's own size names: a migrated file uses the named steps only (text-caption … text-hero)
  'type-scale': { re: /(?<![\w-])text-(?:xs|sm|base|lg|[2-9]?xl)(?![\w-])/g, why: "Tailwind's default type scale instead of the named steps" },
  // DESIGN.md: weight 600 is the ceiling
  weight: { re: /(?<![\w-])font-(?:bold|extrabold|black)(?![\w-])/g, why: 'font weight above 600' },
  // rounded-xl and larger (any side): cards are 8 px, dialogs 12 px (rounded-card, rounded-dialog)
  radius: { re: /(?<![\w-])rounded(?:-[trblse]{1,2})?-(?:xl|2xl|3xl)(?![\w-])/g, why: 'radius above the scale' },
  // hand-written shadows and Tailwind's single drops: use shadow-hairline / -raised / -overlay
  shadow: { re: /(?<![\w-])shadow-(?:\[|sm(?![\w-])|md(?![\w-])|lg(?![\w-])|xl(?![\w-])|2xl(?![\w-]))/g, why: 'shadow outside the three elevation levels' },
  // Tailwind palette colours (amber-50, red-600, gray-200 …): use the colour tokens
  palette: {
    re: /(?<![\w-])(?:text|bg|border(?:-[trblxy])?|ring|ring-offset|fill|stroke|from|via|to|divide|outline|decoration|accent|caret|placeholder|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?![\w-])/g,
    why: 'Tailwind palette colour instead of a token',
  },
  hex: { re: /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g, why: 'hex colour instead of a token' },
}

export interface Finding { file: string; line: number; rule: Rule; text: string }

// Comments do not count (a PR number like #119 is not a colour). Removes /* … */ and // … outside of URLs.
function stripComments(src: string) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\w'"`])\/\/.*$/gm, '$1')
}

export function scanSource(file: string, src: string): Finding[] {
  const lines = stripComments(src).split('\n')
  const out: Finding[] = []
  lines.forEach((text, i) => {
    for (const [rule, { re }] of Object.entries(RULES) as [Rule, { re: RegExp }][]) {
      re.lastIndex = 0
      for (const m of text.matchAll(re)) out.push({ file, line: i + 1, rule, text: m[0] })
    }
  })
  return out
}
