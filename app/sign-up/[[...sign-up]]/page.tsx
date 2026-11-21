import { SignUp } from '@clerk/nextjs'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/Logo'
import { signUpOpen, WAITLIST_PATH } from '@/lib/marketing/site'

// Read per request: whether sign-up is open follows BILLING_ENABLED on the server, not its value at build time.
export const dynamic = 'force-dynamic'

// Sign-up (12-04): open once billing is live (the trial starts here); until then the waitlist form on the landing page.
export default function SignUpPage() {
  if (!signUpOpen()) redirect(WAITLIST_PATH)
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background">
      <Logo className="scale-125" />
      <SignUp />
    </div>
  )
}
