'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { VERSIONS, type DocVersion } from '@/lib/versions'

interface Props {
  /** The version of the page currently being viewed. */
  current: DocVersion
  /**
   * Destination when a version is chosen. We can't reliably map an arbitrary
   * page across versions, so callers land on a per-section root (docs intro /
   * API home) of the chosen version.
   */
  hrefForVersion: (version: DocVersion) => string
}

// "Latest Version" selector shown above the docs/API sidebar.
export default function VersionSelector({ current, hrefForVersion }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function select(version: DocVersion) {
    setOpen(false)
    if (version.version !== current.version) {
      router.push(hrefForVersion(version))
    }
  }

  return (
    <div ref={ref} className="relative mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5 text-left hover:bg-foreground/[0.06] transition-colors"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <TagIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">
            {current.latest ? 'Latest Version' : 'Version'}
          </span>
          <span className="block text-xs text-muted-foreground">{current.label}</span>
        </span>
        <ChevronUpDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-background shadow-lg"
        >
          {VERSIONS.map((version) => {
            const isCurrent = version.version === current.version
            return (
              <li key={version.version}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => select(version)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                    isCurrent
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                  }`}
                >
                  <span>{version.label}</span>
                  {version.latest && (
                    <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Latest
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function TagIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  )
}

function ChevronUpDownIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
    </svg>
  )
}
