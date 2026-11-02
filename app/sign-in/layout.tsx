import { ClerkProvider } from '@clerk/nextjs'
import { LegalLinks } from '@/components/legal/LegalFooter'

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      {children}
      <div className="bg-background pb-6"><LegalLinks className="justify-center" /></div>
    </ClerkProvider>
  )
}
