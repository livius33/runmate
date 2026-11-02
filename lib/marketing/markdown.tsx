// A tiny Markdown renderer for the methodology texts (Phase 6): ## / ### headings, paragraphs, "- " and "1. " lists
// (indented continuation lines join the item), **bold**, *italic*, `code` and [links](https://…). Produces React
// elements, never raw HTML, so a template cannot inject markup. Enough for methodologies/*.md; not a general parser.
import { Fragment, type ReactNode } from 'react'

type ListBlock = { kind: 'ul'; items: string[] } | { kind: 'ol'; items: string[] }
export type Block = { kind: 'h2'; text: string } | { kind: 'h3'; text: string } | { kind: 'p'; text: string } | ListBlock

export function parseBlocks(md: string): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  let list: ListBlock | null = null
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') })
    if (list) blocks.push(list)
    para = []
    list = null
  }
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd()
    const h = line.match(/^(#{2,3})\s+(.*)$/)
    const ul = line.match(/^[-*]\s+(.*)$/)
    const ol = line.match(/^\d+\.\s+(.*)$/)
    if (!line.trim()) { flush(); continue }
    if (h) { flush(); blocks.push({ kind: h[1].length === 2 ? 'h2' : 'h3', text: h[2] }); continue }
    if (ul || ol) {
      const kind = ul ? 'ul' : 'ol'
      if (para.length || (list && list.kind !== kind)) flush()
      list ??= { kind, items: [] } as ListBlock
      list.items.push((ul ?? ol)![1])
      continue
    }
    if (list && /^\s+\S/.test(raw)) { list.items[list.items.length - 1] += ` ${line.trim()}`; continue }
    if (list) flush()
    para.push(line.trim())
  }
  flush()
  return blocks
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g

export function inline(text: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="rounded bg-secondary px-1 py-0.5 text-[0.9em]">{part.slice(1, -1)}</code>
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/)
    if (link) return <a key={i} href={link[2]} rel="noopener" className="underline underline-offset-2 hover:text-foreground">{link[1]}</a>
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
    return <Fragment key={i}>{part}</Fragment>
  })
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="grid gap-4 text-[15px] leading-relaxed text-foreground/85">
      {parseBlocks(source).map((b, i) => {
        if (b.kind === 'ul' || b.kind === 'ol') {
          const Tag = b.kind
          return (
            <Tag key={i} className={`grid max-w-[68ch] gap-1.5 pl-5 ${b.kind === 'ul' ? 'list-disc' : 'list-decimal'} marker:text-muted-foreground`}>
              {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
            </Tag>
          )
        }
        if (b.kind === 'h2') return <h2 key={i} className="mt-6 font-display text-xl font-semibold tracking-tight text-foreground">{inline(b.text)}</h2>
        if (b.kind === 'h3') return <h3 key={i} className="mt-2 font-semibold text-foreground">{inline(b.text)}</h3>
        return <p key={i} className="max-w-[68ch]">{inline(b.text)}</p>
      })}
    </div>
  )
}
