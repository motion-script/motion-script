import React, { useRef } from 'react';
import Link from '@docusaurus/Link';
import { motion, useInView } from 'framer-motion';

const docLinks = [
  {
    title: 'Getting Started',
    description: 'Set up your first project in under 5 minutes',
    href: '/docs/intro',
  },
  {
    title: 'API Reference',
    description: 'Complete documentation for every module and function',
    href: '/docs/intro',
  },
  {
    title: 'Examples & Tutorials',
    description: 'Learn by building real-world motion graphics projects',
    href: '/docs/intro',
  },
];

export default function DocsSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="docs" className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <span className="inline-block mb-4 px-2.5 py-0.5 text-xs font-medium rounded-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--muted-foreground)]">
            Documentation
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-[var(--foreground)] mb-4">
            Learn at your own pace
          </h2>
          <p className="text-[var(--muted-foreground)] max-w-2xl mx-auto text-base sm:text-lg">
            Comprehensive docs, interactive examples, and a welcoming community to help you build
            amazing things.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {docLinks.map((doc, i) => (
            <motion.div
              key={doc.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <Link
                href={doc.href}
                className="group relative flex flex-col p-6 rounded-xl bg-[var(--foreground)]/[0.03] border border-[var(--border)] hover:bg-[var(--foreground)]/[0.06] hover:border-[var(--foreground)]/20 transition-all duration-300 no-underline hover:no-underline h-full"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--foreground)]/5 border border-[var(--border)] flex items-center justify-center mb-4">
                  <BookIcon className="w-5 h-5 text-[var(--muted-foreground)]" />
                </div>
                <h3 className="font-bold text-[var(--foreground)] text-lg mb-2 flex items-center gap-2">
                  {doc.title}
                  <ExternalLinkIcon className="w-3 h-3 text-[var(--muted-foreground)]/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                </h3>
                <p className="text-[var(--muted-foreground)] text-sm leading-relaxed">
                  {doc.description}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContributeSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="contribute" className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--foreground)]/[0.03] p-8 sm:p-12 lg:p-16 text-center"
        >
          {/* Background gradient orbs */}
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <HeartIcon className="w-8 h-8 text-white" />
            </div>

            <h2 className="text-3xl md:text-4xl  font-serif font-bold text-[var(--foreground)] mb-4">
              Support the project today
            </h2>
            <p className="text-[var(--muted-foreground)] w-full  mx-auto text-base sm:text-lg mb-8 leading-relaxed">
              MotionScript is open source and thrives on community contributions. Whether
              you&apos;re fixing bugs, adding features, or improving docs — every contribution
              matters.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://github.com/motion-script/motion-script"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-8 h-12 bg-indigo-500  text-base font-semibold hover:opacity-90 rounded-lg transition-opacity no-underline w-full sm:w-auto justify-center"
              >
                <GithubIcon className="h-5 w-5 " />
                Star on GitHub
                <ArrowRightIcon className="h-4 w-4" />
              </a>
              <a
                href="https://github.com/motion-script/motion-script/blob/main/CONTRIBUTING.md"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-8 h-12 text-base font-medium border border-[var(--border)] text-[var(--foreground)] bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-lg transition-colors no-underline w-full sm:w-auto justify-center"
              >
                Read Contributing Guide
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function BookIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function ExternalLinkIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function HeartIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function GithubIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function ArrowRightIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
