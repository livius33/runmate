import { ChipButton } from '@/components/ui/chip'
import { WEEKDAYS, type Weekday } from '@/lib/plan/athlete-profile'

// Mo … So as toggle chips, the same everywhere (onboarding, training profile, rebuild). Seven equal columns share one
// row, capped at 21.5 rem (44 px per chip, the old natural width), so they never wrap 6 + 1 in a narrow container;
// 40 px high on phones, the chip's own 32 px from sm up.
export function WeekdayPicker({ label, value, onToggle }: { label: string; value: Weekday[]; onToggle: (d: Weekday) => void }) {
  return (
    <div className="grid max-w-[21.5rem] grid-cols-7 gap-1.5" role="group" aria-label={label}>
      {WEEKDAYS.map((w) => (
        <ChipButton key={w.d} selected={value.includes(w.d)} onClick={() => onToggle(w.d)} aria-label={w.long}
          className="h-10 w-full justify-center px-0 sm:h-8">
          {w.short}
        </ChipButton>
      ))}
    </div>
  )
}
