import path from "path"

// ---------------------------------------------------------------------------
// Versioned docs registry
// ---------------------------------------------------------------------------
//
// The site uses a "latest unprefixed, older prefixed" scheme:
//
//   content/docs/                      -> latest version, URLs are /docs/<slug>
//   content/versioned_docs/version-X/  -> older version X, URLs are /docs/X/<slug>
//
// `VERSIONS` is the single source of truth. The first entry is the latest and
// is the only one served without a version prefix. To cut a new version, copy
// content/docs into content/versioned_docs/version-<old> and prepend the new
// latest here (see content/versioned_docs/README.md).

export interface DocVersion {
  /** Semver-ish identifier, also the URL segment for non-latest versions. */
  version: string
  /** Label shown in the version selector. */
  label: string
  /** True for the single latest version (served without a URL prefix). */
  latest: boolean
}

// The "latest" docs version tracks the engine's published version. This module
// is bundled for the browser too (the version selector is a client component),
// so we can't read core/package.json with `fs` here. Instead `next.config.ts`
// reads it in Node and inlines it as NEXT_PUBLIC_CORE_VERSION at build time.
const LATEST_VERSION_ID = process.env.NEXT_PUBLIC_CORE_VERSION || "3.0.0"

export const VERSIONS: DocVersion[] = [
  { version: LATEST_VERSION_ID, label: LATEST_VERSION_ID, latest: true },
  { version: "1.0.0", label: "1.0.0", latest: false },
]

export const LATEST_VERSION = VERSIONS.find((v) => v.latest) ?? VERSIONS[0]

const VERSION_BY_ID = new Map(VERSIONS.map((v) => [v.version, v]))

/** Is `segment` a known non-latest version id (a URL prefix like "1.0.0")? */
export function isVersionSegment(segment: string | undefined): boolean {
  if (!segment) return false
  const v = VERSION_BY_ID.get(segment)
  return v != null && !v.latest
}

export function getVersion(version: string): DocVersion | undefined {
  return VERSION_BY_ID.get(version)
}

/**
 * Absolute path to the content directory backing a version. Latest lives in
 * content/docs; older versions in content/versioned_docs/version-<id>.
 */
export function versionContentDir(version: DocVersion): string {
  if (version.latest) return path.join(process.cwd(), "content/docs")
  return path.join(process.cwd(), "content/versioned_docs", `version-${version.version}`)
}

/**
 * Root directory holding a version's API (typedoc) markdown. The latest API is
 * generated from the packages' source into content/api by `build:api` (see
 * scripts/build-api.mjs) and is gitignored; older versions are snapshotted
 * inside this package under content/versioned_api/version-<id>.
 */
export function versionApiDir(version: DocVersion): string {
  if (version.latest) return path.join(process.cwd(), "content/api")
  return path.join(process.cwd(), "content/versioned_api", `version-${version.version}`)
}

/**
 * Split an incoming catch-all slug (`/docs/...` or `/api/...`) into its version
 * and the path within that version. A leading version segment selects a
 * non-latest version and is stripped; otherwise the slug targets the latest.
 */
export function resolveVersionFromSlug(slug: string[]): { version: DocVersion; docSlug: string[] } {
  if (slug.length > 0 && isVersionSegment(slug[0])) {
    return { version: getVersion(slug[0])!, docSlug: slug.slice(1) }
  }
  return { version: LATEST_VERSION, docSlug: slug }
}

/** URL prefix segments for a version: [] for latest, [version] otherwise. */
export function versionPrefix(version: DocVersion): string[] {
  return version.latest ? [] : [version.version]
}

/** Full `/docs/...` href for a doc within a version. */
export function versionedHref(version: DocVersion, docSlug: string[]): string {
  return "/docs/" + [...versionPrefix(version), ...docSlug].join("/")
}

/** Full `/api/...` href for an API page within a version. */
export function versionedApiHref(version: DocVersion, slug: string[]): string {
  return "/api/" + [...versionPrefix(version), ...slug].join("/")
}
