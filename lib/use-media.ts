'use client'

import { useEffect, useState } from 'react'

// True below Tailwind's `sm` breakpoint (640 px). False on the server and on first render, so wide layouts never flash.
export function useIsPhone() {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setPhone(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return phone
}
