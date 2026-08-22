import Navbar from '@/components/landing/Navbar'
import HeroSection from '@/components/landing/HeroSection'
import ProceduralSection from '@/components/landing/ProceduralSection'
import FeaturesSection from '@/components/landing/FeaturesSection'
import { ContributeSection } from '@/components/landing/DocsSection'
import Footer from '@/components/landing/Footer'

export default function Page() {
  return (
    <div className="relative min-h-screen overflow-x-hidden font-sans dark bg-background">
      <Navbar />

      <main>
        <HeroSection />

        <div className="relative bg-background">
          <ProceduralSection />
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          <FeaturesSection />
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          <ContributeSection />
        </div>
      </main>

      <Footer />
    </div>
  )
}
