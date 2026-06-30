import Link from 'next/link'
import type { BreadcrumbEntry } from '@/lib/docs'

interface Props {
  entries: BreadcrumbEntry[]
}

export default function Breadcrumbs({ entries }: Props) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 not-prose">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <li className="flex items-center">
          <Link
            href="/docs/intro"
            className="flex items-center rounded-md p-1 hover:text-foreground hover:bg-foreground/5 transition-colors"
            aria-label="Docs home"
          >
            <HomeIcon className="h-4 w-4" />
          </Link>
        </li>
        {entries.map((entry, i) => {
          const isLast = i === entries.length - 1
          return (
            <li key={i} className="flex items-center gap-1.5">
              <ChevronIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              {entry.href && !isLast ? (
                <Link
                  href={entry.href}
                  className="rounded-md px-1.5 py-0.5 hover:text-foreground hover:bg-foreground/5 transition-colors"
                >
                  {entry.label}
                </Link>
              ) : (
                <span
                  className={`px-1.5 py-0.5 ${isLast ? 'text-foreground font-medium' : ''}`}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {entry.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function HomeIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
    </svg>
  )
}

function ChevronIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}
