'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ApiSidebarItem, ApiPackage } from '@/lib/api'

function itemHref(slug: string[]): string {
  return '/api/' + slug.join('/')
}

function DocItem({ item, depth = 0 }: { item: ApiSidebarItem; depth?: number }) {
  const pathname = usePathname()

  if (item.type === 'doc') {
    const href = itemHref(item.slug)
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

  return <CategoryItem item={item} depth={depth} pathname={pathname} />
}

function CategoryItem({
  item,
  depth,
  pathname,
}: {
  item: Extract<ApiSidebarItem, { type: 'category' }>
  depth: number
  pathname: string
}) {
  const isChildActive = item.items.some(
    (child) => child.type === 'doc' && pathname === itemHref(child.slug),
  )
  const [open, setOpen] = useState(isChildActive || depth === 0)

  const label = item.indexSlug ? (
    <Link
      href={itemHref(item.indexSlug)}
      className="flex-1 text-left hover:text-foreground transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {item.label}
    </Link>
  ) : (
    <span className="flex-1 text-left">{item.label}</span>
  )

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors"
        style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
      >
        {label}
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

function PackageSection({ pkg }: { pkg: ApiPackage }) {
  const pathname = usePathname()
  const isActive = pathname.startsWith('/api/' + pkg.pkg + '/')  || pathname === '/api/' + pkg.pkg

  return (
    <div className="mb-4">
      <Link
        href={itemHref(pkg.indexSlug)}
        className={`block mb-1 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors ${
          isActive
            ? 'text-primary'
            : 'text-muted-foreground/60 hover:text-muted-foreground'
        }`}
      >
        {pkg.label}
      </Link>
      <div className="space-y-0.5">
        {pkg.items.map((item, i) => (
          <DocItem key={i} item={item} depth={0} />
        ))}
      </div>
    </div>
  )
}

export default function ApiSidebar({ packages }: { packages: ApiPackage[] }) {
  return (
    <nav>
      {packages.map((pkg) => (
        <PackageSection key={pkg.pkg} pkg={pkg} />
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
