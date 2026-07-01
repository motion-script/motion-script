import Link from 'next/link'
import { getSidebar } from '@/lib/docs'
import { VERSIONS } from '@/lib/versions'
import VersionedSidebar, { type SidebarsByVersion } from '@/components/docs/VersionedSidebar'
import MobileSidebar from '@/components/docs/MobileSidebar'
import { Logo } from '@/components/landing/Logo'
import Footer from '@/components/landing/Footer'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SearchTrigger } from '@/components/docs/SearchTrigger'

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  // Pre-render every version's sidebar; VersionedSidebar picks one by pathname.
  const sidebars: SidebarsByVersion = Object.fromEntries(
    VERSIONS.map((version) => [version.version, getSidebar(version)]),
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 sm:gap-6 px-4 h-14">
          <MobileSidebar>
            <VersionedSidebar sidebars={sidebars} />
          </MobileSidebar>

          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Logo className="h-5 w-5 text-foreground" />
            <span className="font-serif text-base text-foreground flex items-center">
              <span className="font-thin scale-90 inline-block">Motion</span>
              <span className="font-code font-medium">Script</span>
            </span>
          </Link>

          <div className="hidden sm:flex items-center gap-1 text-sm">
            <Link href="/docs/intro" className="px-3 py-1.5 rounded-md text-foreground font-medium bg-foreground/5">
              Docs
            </Link>
            <Link href="/api/core" className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors">
              API
            </Link>
            <Link href="/blog" className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors">
              Blog
            </Link>
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <SearchTrigger />
            <a
              href="https://github.com/motion-script/motion-script"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-foreground/5 transition-colors"
            >
              <GithubIcon className="h-4 w-4" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        {/* Sidebar (desktop) */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r border-border px-4 py-6 lg:block">
          <VersionedSidebar sidebars={sidebars} />
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <article className="prose-docs max-w-3xl">
            {children}
          </article>
        </main>

        {/* Table of contents — right column, rendered by each page via a slot */}
        <aside
          id="toc-panel"
          className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto px-4 py-8 xl:block"
        />
      </div>

      <Footer />
    </div>
  )
}

function GithubIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}
