'use client'

import { usePathname } from 'next/navigation'
import type { SidebarItem } from '@/lib/docs'
import { LATEST_VERSION, isVersionSegment, getVersion, versionedHref, type DocVersion } from '@/lib/versions'
import DocsSidebar from './DocsSidebar'
import VersionSelector from './VersionSelector'

// Pre-rendered sidebar for each version, keyed by version id. Computed on the
// server (in the layout) and passed down so this client component can swap
// sidebars without refetching when the active version changes.
export type SidebarsByVersion = Record<string, SidebarItem[]>

interface Props {
  sidebars: SidebarsByVersion
}

// The layout can't read the `[...slug]` params (it sits above that segment), so
// the active version is derived from the URL here: a leading /docs/<version>/
// segment selects a non-latest version, otherwise it's the latest.
function versionFromPathname(pathname: string): DocVersion {
  const parts = pathname.replace(/^\/docs\/?/, '').split('/').filter(Boolean)
  if (isVersionSegment(parts[0])) return getVersion(parts[0])!
  return LATEST_VERSION
}

export default function VersionedSidebar({ sidebars }: Props) {
  const pathname = usePathname()
  const version = versionFromPathname(pathname)
  const items = sidebars[version.version] ?? sidebars[LATEST_VERSION.version] ?? []

  return (
    <>
      <VersionSelector current={version} hrefForVersion={(v) => versionedHref(v, ['intro'])} />
      <DocsSidebar items={items} />
    </>
  )
}
