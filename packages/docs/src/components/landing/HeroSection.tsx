import React from 'react';
import Link from '@docusaurus/Link';
import GradientBackground from './GradientBackground';
import CreateTerminal from './CreateTerminal';

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 pt-16">
      {/* Three.js animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <GradientBackground />
        <div className="absolute inset-0 " />
      </div>

      <div className="relative z-30 mx-auto max-w-5xl text-center">
        <h1
          className="hero-fade-up mt-12 font-serif  leading-[1.1] text-[var(--foreground)]"
          style={{ animationDelay: '0.3s' }}
        >
          <span className="bg-gradient-to-r  text-4xl sm:text-5xl  lg:text-6xl  from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
            Motion graphics
          </span>
          <br />
          <span className="text-4xl  lg:text-5xl ">


            with <span className="font-pixelify">code</span>
          </span>
        </h1>

        <div
          className="hero-fade-up  flex justify-center mb-4"
          style={{ animationDelay: '0.5s' }}
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 text-sm rounded-full bg-(--foreground)/10 border border-border text-white/60 backdrop-blur-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            Open Source &middot; Free Forever
          </span>
        </div>

        <p
          className="hero-fade-up mt-6 text-base sm:text-lg text-[var(--muted-foreground)] max-w-2xl mx-auto leading-relaxed"
          style={{ animationDelay: '0.7s' }}
        >
          An open-source motion design tool, inspired by tools like Manim to help developers and
          educators create stunning animations — all from your browser.
        </p>

        <div
          className="hero-fade-up mt-8 flex items-center justify-center gap-4"
          style={{ animationDelay: '0.9s' }}
        >
          <a
            href="/docs/intro"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-medium text-sm transition-colors"
          >
            Get Started
          </a>
        </div>

        <div
          className="hero-fade-up mt-10 flex justify-center"
          style={{ animationDelay: '1.1s' }}
        >
          <CreateTerminal />
        </div>


      </div>

      {/* Scroll indicator */}
      <div className="hero-fade-in absolute bottom-8 left-1/2 -translate-x-1/2 z-30" style={{ animationDelay: '1.5s' }}>
        <div className="scroll-bounce w-6 h-10 rounded-full border-2 border-[var(--border)] flex items-start justify-center p-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)]" />
        </div>
      </div>
    </section>
  );
}

