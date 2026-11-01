import { SignIn } from '@clerk/nextjs'
import { Logo } from '@/components/Logo'

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background">
      <Logo className="scale-125" />
      <SignIn />
    </div>
  )
}
