'use client'

import { useEffect, useRef, useState } from 'react'

export interface TocEntry {
  id: string
  text: string
  depth: 2 | 3
}

export function TableOfContents({ entries, editUrl }: { entries: TocEntry[]; editUrl?: string | null }) {
  const [activeId, setActiveId] = useState<string>('')
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (entries.length === 0) return

    const headingEls = entries
      .map((e) => document.getElementById(e.id))
      .filter(Boolean) as HTMLElement[]

    observerRef.current = new IntersectionObserver(
      (records) => {
        // Pick the topmost visible heading
        const visible = records
          .filter((r) => r.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) setActiveId(visible[0].target.id)
      },
      { rootMargin: '0px 0px -60% 0px', threshold: 0 },
    )

    headingEls.forEach((el) => observerRef.current!.observe(el))
    return () => observerRef.current?.disconnect()
  }, [entries])

  if (entries.length === 0 && !editUrl) return null

  return (
    <nav aria-label="On this page">
      {entries.length > 0 && (
        <p className="mb-3 text-xs font-semibold text-muted-foreground">
          On this page
        </p>
      )}
      {entries.length > 0 && (
        <ul className="border-l border-border space-y-1">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={[
                'relative',
                entry.depth === 3 ? 'pl-6' : 'pl-3',
              ].join(' ')}
            >
              {activeId === entry.id && (
                <span className="absolute -left-px top-0 bottom-0 w-0.5 bg-foreground" />
              )}
              <a
                href={`#${entry.id}`}
                className={[
                  'block truncate text-sm transition-colors py-0.5',
                  activeId === entry.id
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(entry.id)?.scrollIntoView({ behavior: 'smooth' })
                  setActiveId(entry.id)
                }}
              >
                {entry.text}
              </a>
            </li>
          ))}
        </ul>
      )}
      {editUrl && (
        <>
          <hr className="my-4 border-t border-border" />
          <a
            href={editUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <GithubIcon className="h-4 w-4" />
            Edit this page on GitHub
          </a>
        </>
      )}
    </nav>
  )
}

function GithubIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}
