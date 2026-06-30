'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { Search, FileText, Hash, CornerDownLeft } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  searchSections,
  type SearchEntry,
  type SearchSectionGroup,
  type SearchIndex,
} from '@/lib/search'

// The static index is small and only needed once search is opened, so it is
// fetched lazily on first open and cached in a module-level promise — shared
// across every dialog instance, never refetched, and never part of the initial
// page payload.
let indexPromise: Promise<SearchIndex> | null = null
function loadIndex(): Promise<SearchIndex> {
  if (!indexPromise) {
    indexPromise = fetch('/search-index.json')
      .then((r) => (r.ok ? (r.json() as Promise<SearchIndex>) : []))
      .catch(() => [])
  }
  return indexPromise
}

const DEBOUNCE_MS = 120
const RESULT_LIMIT = 20

export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [index, setIndex] = useState<SearchIndex | null>(null)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Lazy-load the index the first time the dialog opens.
  useEffect(() => {
    if (open && index === null) loadIndex().then(setIndex)
  }, [open, index])

  // Debounce the query so typing fast doesn't re-rank on every keystroke. A new
  // committed query also resets the active row to the top — both are driven by
  // the same user input, so they belong together (no separate results effect).
  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(query)
      setActiveIndex(0)
    }, DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [query])

  const sections = useMemo<SearchSectionGroup[]>(() => {
    if (!index || !debounced.trim()) return []
    return searchSections(debounced, index, RESULT_LIMIT)
  }, [index, debounced])

  // Flatten the section → page → subheading hierarchy into the linear order rows
  // are rendered in (each page header followed by its children, sections in
  // order). Keyboard navigation and the active-row index operate on this flat
  // list so it walks the visible result rows top-to-bottom; section headers are
  // labels, not selectable rows, so they're excluded.
  const flat = useMemo<SearchEntry[]>(
    () =>
      sections.flatMap((section) =>
        section.groups.flatMap((g) => [g.page, ...g.children]),
      ),
    [sections],
  )

  // Wrap open changes so closing the dialog also clears transient state — done
  // in the event path rather than an effect to avoid a cascading reset render.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setQuery('')
        setDebounced('')
        setActiveIndex(0)
      }
      onOpenChange(next)
    },
    [onOpenChange],
  )

  const go = useCallback(
    (entry: SearchEntry | undefined) => {
      if (!entry) return
      handleOpenChange(false)
      router.push(entry.url)
    },
    [handleOpenChange, router],
  )

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (flat.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % flat.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + flat.length) % flat.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(flat[activeIndex])
    }
  }

  // Scroll the active option into view as it changes.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity" />
        <Dialog.Popup
          // Focus the input rather than the first focusable element.
          initialFocus={inputRef}
          className={cn(
            'fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2',
            'overflow-hidden rounded-2xl border border-border bg-background shadow-2xl',
            'data-[starting-style]:opacity-0 data-[starting-style]:scale-95',
            'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
            'transition-[opacity,transform] duration-150',
          )}
        >
          <Dialog.Title className="sr-only">Search documentation</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search docs and API by page title or heading. Use the arrow keys to navigate results and
            Enter to open.
          </Dialog.Description>

          {/* Search field */}
          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search docs…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={flat.length > 0}
              aria-controls="search-results"
              aria-activedescendant={flat.length > 0 ? `search-option-${activeIndex}` : undefined}
              className="h-12 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          {/* Results */}
          <Results
            listRef={listRef}
            sections={sections}
            flat={flat}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            onSelect={go}
            query={debounced}
            loading={index === null}
          />

          {/* Footer hint */}
          {flat.length > 0 && (
            <div className="hidden sm:flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              <Hint keys={['↑', '↓']}>navigate</Hint>
              <Hint keys={['↵']}>open</Hint>
              <Hint keys={['esc']}>close</Hint>
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Results({
  listRef,
  sections,
  flat,
  activeIndex,
  setActiveIndex,
  onSelect,
  query,
  loading,
}: {
  listRef: React.RefObject<HTMLUListElement | null>
  sections: SearchSectionGroup[]
  flat: SearchEntry[]
  activeIndex: number
  setActiveIndex: (i: number) => void
  onSelect: (entry: SearchEntry) => void
  query: string
  loading: boolean
}) {
  if (query.trim() === '') {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        {loading ? 'Loading search…' : 'Search docs and the API by title or heading.'}
      </p>
    )
  }

  if (flat.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        No results for “{query}”.
      </p>
    )
  }

  // Each selectable row (page header, then its children) maps to a position in
  // the flat list so the active index lines up with keyboard navigation. The
  // flat list is already in render order, so a url→index map resolves each row's
  // position without a mutable render-time counter. Entry urls are unique (page
  // base urls and anchored subheading urls are all distinct).
  const flatIndexByUrl = new Map(flat.map((entry, i) => [entry.url, i]))

  return (
    <ul
      ref={listRef}
      id="search-results"
      role="listbox"
      aria-label="Search results"
      className="max-h-[min(60vh,24rem)] overflow-y-auto p-2"
    >
      {sections.map((section) => (
        <li key={section.category} role="presentation" className="not-first:mt-3">
          <div className="flex items-center gap-2 px-3 pb-1 pt-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {section.label}
            </span>
            <span className="rounded border border-border px-1.5 py-px text-[9px] uppercase tracking-wide text-muted-foreground">
              {section.section}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <ul role="group" aria-label={section.label}>
            {section.groups.map((group) => {
              const pageIndex = flatIndexByUrl.get(group.page.url) ?? -1
              return (
                <li key={group.page.url} className="not-first:mt-0.5">
                  <ResultRow
                    entry={group.page}
                    flatIndex={pageIndex}
                    active={pageIndex === activeIndex}
                    setActiveIndex={setActiveIndex}
                    onSelect={onSelect}
                  />
                  {group.children.length > 0 && (
                    <ul
                      role="group"
                      aria-label={group.page.title}
                      className="ml-3.5 mt-0.5 border-l border-border pl-1.5"
                    >
                      {group.children.map((child) => {
                        const childIndex = flatIndexByUrl.get(child.url) ?? -1
                        return (
                          <li key={child.url}>
                            <ResultRow
                              entry={child}
                              flatIndex={childIndex}
                              active={childIndex === activeIndex}
                              setActiveIndex={setActiveIndex}
                              onSelect={onSelect}
                            />
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ul>
  )
}

function ResultRow({
  entry,
  flatIndex,
  active,
  setActiveIndex,
  onSelect,
}: {
  entry: SearchEntry
  flatIndex: number
  active: boolean
  setActiveIndex: (i: number) => void
  onSelect: (entry: SearchEntry) => void
}) {
  const isPage = entry.depth === 1
  return (
    <a
      id={`search-option-${flatIndex}`}
      data-index={flatIndex}
      role="option"
      aria-selected={active}
      href={entry.url}
      onClick={(e) => {
        e.preventDefault()
        onSelect(entry)
      }}
      onMouseMove={() => setActiveIndex(flatIndex)}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm',
        active ? 'bg-foreground/5 text-foreground' : 'text-muted-foreground',
      )}
    >
      {isPage ? (
        <FileText className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
      ) : (
        <Hash className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
      )}
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          isPage ? 'font-medium text-foreground' : 'text-muted-foreground',
        )}
      >
        {entry.heading}
      </span>
      {active && (
        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </a>
  )
}

function Hint({ keys, children }: { keys: string[]; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k) => (
        <kbd
          key={k}
          className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[10px]"
        >
          {k}
        </kbd>
      ))}
      <span>{children}</span>
    </span>
  )
}
