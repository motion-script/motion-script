import React from 'react';
import Link from '@docusaurus/Link';

export default function EditorSection() {
  return (
    <section className="relative px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
      <div className="mx-auto w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        {/* Left: editor preview */}
        <div className="order-2 lg:order-1">
          <div className="relative aspect-1610/1213 w-full rounded-2xl border border-[var(--border)] bg-[var(--foreground)]/[0.03] overflow-hidden">
            {/* Subtle gradient orbs for depth */}
            <div className="absolute -top-10 -left-10 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

            <img
              src="/editor.jpg"
              alt="Motion Script web editor"
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        </div>

        {/* Right: copy + CTA */}
        <div className="order-1 lg:order-2">
          <span className="inline-block mb-4 px-2.5 py-0.5 text-xs font-medium rounded-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--muted-foreground)]">
            Editor
          </span>
          <h2 className="font-serif text-4xl sm:text-5xl md:text-6xl tracking-tight leading-[1.1] text-[var(--foreground)] mb-6">
            Best of <span className="bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">Both</span> Worlds
          </h2>
          <p className="text-base sm:text-lg text-[var(--muted-foreground)] leading-relaxed mb-4 max-w-xl">
            Some things are easier with a mouse. Write animations in TypeScript with your
            favorite IDE; use a web-based editor to sync them with audio.
          </p>
          <p className="text-base sm:text-lg text-[var(--muted-foreground)] leading-relaxed mb-8 max-w-xl">
            Powered by Vite, a real-time preview of your animation automatically updates upon any
            changes.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Link
              href="/editor"
              className="inline-flex items-center gap-2 px-6 h-12 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-medium text-sm transition-colors no-underline hover:no-underline w-full sm:w-auto justify-center"
            >
              Launch Editor
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
            <Link
              href="/docs/intro"
              className="inline-flex items-center gap-2 px-6 h-12 rounded-lg border border-[var(--border)] bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--foreground)] font-medium text-sm transition-colors no-underline hover:no-underline w-full sm:w-auto justify-center"
            >
              Read the Docs
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function ArrowRightIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
