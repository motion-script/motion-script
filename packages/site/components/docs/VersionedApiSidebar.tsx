'use client'

import { usePathname } from 'next/navigation'
import type { ApiPackage } from '@/lib/api'
import { LATEST_VERSION, isVersionSegment, getVersion, type DocVersion } from '@/lib/versions'
import ApiSidebar from './ApiSidebar'
import VersionSelector from './VersionSelector'

// Per-version API data computed on the server (in the layout) and passed down so
// this client component can swap sidebars by pathname without refetching.
export type ApiPackagesByVersion = Record<string, ApiPackage[]>
export type ApiHomeByVersion = Record<string, string> // version id -> /api/... href

interface Props {
  packages: ApiPackagesByVersion
  /** Where the selector should navigate for each version (its API home). */
  homes: ApiHomeByVersion
}

// The layout sits above the `[...slug]` segment, so the active version is
// derived from the URL: a leading /api/<version>/ segment selects a non-latest
// version, otherwise it's the latest.
function versionFromPathname(pathname: string): DocVersion {
  const parts = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  if (isVersionSegment(parts[0])) return getVersion(parts[0])!
  return LATEST_VERSION
}

export default function VersionedApiSidebar({ packages, homes }: Props) {
  const pathname = usePathname()
  const version = versionFromPathname(pathname)
  const pkgs = packages[version.version] ?? packages[LATEST_VERSION.version] ?? []

  return (
    <>
      <VersionSelector
        current={version}
        hrefForVersion={(v) => homes[v.version] ?? homes[LATEST_VERSION.version]}
      />
      <ApiSidebar packages={pkgs} />
    </>
  )
}
