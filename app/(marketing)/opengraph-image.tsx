import { de } from '@/lib/i18n/de'
import { ogImage, OG_SIZE } from './_components/og'

export const dynamic = 'force-static'
export const alt = de.meta.ogAlt
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return ogImage(de)
}
