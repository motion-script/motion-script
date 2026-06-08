import React from 'react';
import type { ReactNode } from 'react';
import Layout from '@theme/Layout';
import Navbar from '@site/src/components/landing/Navbar';
import HeroSection from '@site/src/components/landing/HeroSection';
import EditorSection from '@site/src/components/landing/EditorSection';
import FeaturesSection from '@site/src/components/landing/FeaturesSection';
import DocsSection, { ContributeSection } from '@site/src/components/landing/DocsSection';
import Footer from '@site/src/components/landing/Footer';

export default function Home(): ReactNode {
  return (
    <Layout
      title="MotionScript — Open Source Motion Design Tool"
      description="Create stunning motion graphics with code. An open-source After Effects alternative powered by the web."
      wrapperClassName="home-page"
      noFooter
    >
      <div className="relative min-h-screen  overflow-x-hidden">
        <Navbar />

        <main>
          <HeroSection />

          <div className="relative bg-[var(--background)]">
            <EditorSection />
            <div className="h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
            <FeaturesSection />
            {/* <div className="h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
            <DocsSection /> */}
            <div className="h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
            <ContributeSection />
          </div>
        </main>

        <Footer />
      </div>
    </Layout>
  );
}
