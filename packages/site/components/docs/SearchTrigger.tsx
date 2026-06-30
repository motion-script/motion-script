'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'

import { SearchDialog } from './SearchDialog'

// Mirrors theme-provider.tsx's hotkey guard: don't hijack keys while the user is
// typing in a field or when another handler already consumed the event.
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

/**
 * Header search affordance: a faux search field button that opens the command
 * palette, plus the global keyboard shortcuts (⌘K / Ctrl+K from anywhere; `/`
 * when not typing in a field). Owns the open state so the trigger and dialog
 * stay in sync. Mounted in both the docs and API layout headers.
 */
export function SearchTrigger() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat) return

      // ⌘K / Ctrl+K — toggle from anywhere, even while typing.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }

      // `/` opens, but only when not modifying or typing into a field.
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault()
        setOpen(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search documentation"
        title="Search (⌘K)"
        className="flex items-center gap-2 rounded-md p-2 text-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground sm:w-56 sm:justify-start sm:border sm:border-border sm:bg-background sm:px-3 sm:py-1.5"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="ml-auto hidden items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      <SearchDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
