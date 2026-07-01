'use client'

import { useState } from 'react'

/**
 * Mobile navigation for the docs / API sidebars. Mirrors the landing Navbar's
 * pattern: a hamburger toggle that expands an inline panel directly below the
 * header bar (using the shared `.mobile-menu` grid-rows transition in
 * globals.css), rather than an overlay drawer.
 *
 * The toggle lives in the header's flex row; the expanding panel is pinned
 * `fixed` just under the 56px (`top-14`) sticky header so it spans full width.
 * The sidebar content — `VersionedSidebar` / `VersionedApiSidebar` — is passed
 * as children so this component stays agnostic to docs vs. API.
 */
export default function MobileSidebar({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle navigation menu"
        aria-expanded={open}
        className="lg:hidden -ml-1 flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
      >
        {open ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
      </button>

      {/* Backdrop — closes the menu on tap, sits under the panel. */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden
          className="fixed inset-x-0 top-14 bottom-0 z-40 bg-background/40 lg:hidden"
        />
      )}

      {/* Inline expanding panel, pinned just under the sticky header. The
          grid-rows collapse lives on `.mobile-menu` (its `> div` is clipped);
          scrolling happens on the inner container so a long sidebar can scroll
          without breaking the open/close transition. */}
      <div
        className={`mobile-menu fixed inset-x-0 top-14 z-40 bg-background lg:hidden ${
          open ? 'is-open border-b border-border' : ''
        }`}
      >
        <div>
          {/* Close when a sidebar link is tapped (links route to a new page).
              The version <select> and category toggles aren't anchors, so they
              don't trigger this. */}
          <div
            className="max-h-[calc(100vh-3.5rem)] overflow-y-auto px-4 py-4"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) setOpen(false)
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  )
}

function MenuIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function XIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
