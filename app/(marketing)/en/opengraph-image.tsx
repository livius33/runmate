import { en } from '@/lib/i18n/en'
import { ogImage, OG_SIZE } from '../_components/og'

export const dynamic = 'force-static'
export const alt = en.meta.ogAlt
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return ogImage(en)
}
