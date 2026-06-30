import Link from 'next/link'
import type { DocVersion } from '@/lib/versions'

interface Props {
  /** The (older) version the current page belongs to. */
  current: DocVersion
  /** The latest version users should be pointed to. */
  latest: DocVersion
  /** Where the "current docs" link should go in the latest version. */
  href: string
  /**
   * True when `href` is the equivalent of this exact page in the latest
   * version; false when it's a fallback landing page.
   */
  isEquivalent: boolean
  /** Link text for the equivalent-page case. */
  equivalentLabel?: string
  /** Link text for the fallback case (no equivalent page in latest). */
  fallbackLabel?: string
}

// Banner shown at the top of every doc page belonging to a non-latest version.
// Rendered by the docs page (not MDX) so it appears automatically on every page.
export default function VersionWarning({
  current,
  latest,
  href,
  isEquivalent,
  equivalentLabel = 'View this page in the latest docs',
  fallbackLabel = 'Go to the latest Getting Started',
}: Props) {
  return (
    <div className="not-prose mb-6 rounded-lg border border-yellow-500/40 bg-yellow-500/5 px-4 py-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-yellow-500/90">
        ⚠ Outdated version
      </p>
      <p className="text-sm text-foreground/80">
        This page documents MotionScript <strong className="font-medium text-foreground">{current.label}</strong>,
        which is not the latest release. The current version is{' '}
        <strong className="font-medium text-foreground">{latest.label}</strong>.{' '}
        <Link href={href} className="font-medium text-primary underline underline-offset-2 hover:text-primary/80">
          {isEquivalent ? equivalentLabel : fallbackLabel}
        </Link>
        .
      </p>
    </div>
  )
}
