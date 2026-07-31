'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { SidebarItem } from '@/lib/docs'

interface Props {
  items: SidebarItem[]
}

function slugToHref(slug: string[]): string {
  return '/docs/' + slug.join('/')
}

function DocItem({ item, depth = 0 }: { item: SidebarItem; depth?: number }) {
  const pathname = usePathname()

  if (item.type === 'doc') {
    const href = slugToHref(item.slug)
    const isActive = pathname === href
    return (
      <Link
        href={href}
        className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
          isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
        }`}
        style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
      >
        {item.label}
      </Link>
    )
  }

  // Category
  return <CategoryItem item={item} depth={depth} pathname={pathname} />
}

// The one category that starts open when nothing inside it is active, so the
// sidebar leads with the intro path instead of every section unfurled at once.
const DEFAULT_OPEN_CATEGORY = 'getting-started'

function containsActive(items: SidebarItem[], pathname: string): boolean {
  return items.some((child) =>
    child.type === 'doc'
      ? pathname === slugToHref(child.slug)
      : containsActive(child.items, pathname),
  )
}

function CategoryItem({
  item,
  depth,
  pathname,
}: {
  item: Extract<SidebarItem, { type: 'category' }>
  depth: number
  pathname: string
}) {
  // Auto-expand the category holding the current page (at any nesting level);
  // otherwise only Getting Started is open, and the rest start collapsed.
  const isChildActive = containsActive(item.items, pathname)
  const [open, setOpen] = useState(isChildActive || item.slug === DEFAULT_OPEN_CATEGORY)

  // The sidebar lives in the docs layout, so it survives client-side navigation
  // and the state above is never re-initialised. Now that categories start
  // collapsed, navigating into one (via search, prev/next, or a link in the body)
  // has to open it, or the current page's own entry stays hidden. Adjusting
  // during render rather than in an effect avoids a second render pass.
  const [wasChildActive, setWasChildActive] = useState(isChildActive)
  if (isChildActive !== wasChildActive) {
    setWasChildActive(isChildActive)
    if (isChildActive) setOpen(true)
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors"
        style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
      >
        {item.label}
        <ChevronIcon className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {item.items.map((child, i) => (
            <DocItem key={i} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function DocsSidebar({ items }: Props) {
  return (
    <nav className="space-y-0.5">
      {items.map((item, i) => (
        <DocItem key={i} item={item} depth={0} />
      ))}
    </nav>
  )
}

function ChevronIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}
