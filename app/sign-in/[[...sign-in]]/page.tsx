import { SignIn } from '@clerk/nextjs'
import { Logo } from '@/components/Logo'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <Logo className="scale-125" />
      <SignIn />
    </div>
  )
}
