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

function CategoryItem({
  item,
  depth,
  pathname,
}: {
  item: Extract<SidebarItem, { type: 'category' }>
  depth: number
  pathname: string
}) {
  // Auto-expand if any child is active
  const isChildActive = item.items.some((child) =>
    child.type === 'doc' ? pathname === slugToHref(child.slug) : false,
  )
  const [open, setOpen] = useState(isChildActive || depth === 0)

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
