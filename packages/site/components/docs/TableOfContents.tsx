'use client'

import { useEffect, useRef, useState } from 'react'

export interface TocEntry {
  id: string
  text: string
  depth: 2 | 3
}

export function TableOfContents({ entries }: { entries: TocEntry[] }) {
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

  if (entries.length === 0) return null

  return (
    <nav aria-label="On this page">
      <p className="mb-3 text-xs font-semibold text-muted-foreground">
        On this page
      </p>
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
    </nav>
  )
}
