import fs from "fs"
import path from "path"
import {
  VERSIONS,
  LATEST_VERSION,
  type DocVersion,
  resolveVersionFromSlug,
  versionApiDir,
  versionPrefix,
} from "./versions"

// ── Sidebar types ────────────────────────────────────────────────────────────

export interface ApiSidebarDoc {
  type: "doc"
  /** Version-prefixed URL slug, e.g. ["core", "nodes", "classes", "Node"] or
   *  ["1.0.0", "core", "nodes", "classes", "Node"] for an older version. */
  slug: string[]
  label: string
}

export interface ApiSidebarCategory {
  type: "category"
  label: string
  /** Slug of the index page for this category, if one exists. */
  indexSlug?: string[]
  items: ApiSidebarItem[]
}

export type ApiSidebarItem = ApiSidebarDoc | ApiSidebarCategory

export interface ApiPackage {
  /** npm package label, e.g. "@motion-script/core" */
  label: string
  /** folder name inside api/, e.g. "core" */
  pkg: string
  /** version-prefixed slug for the package index page */
  indexSlug: string[]
  items: ApiSidebarItem[]
}

// ── Typedoc sidebar shape (from the generated .cjs files) ────────────────────

type RawItem =
  | { type: "doc"; id: string; label: string }
  | { type: "category"; label: string; items: RawItem[]; link?: { type: string; id: string } }

function loadRawSidebar(apiDir: string, pkg: string): RawItem[] {
  // Use fs + Function eval instead of require() — Turbopack/Next.js can't
  // resolve dynamic require() paths across package boundaries at build time.
  const src = fs.readFileSync(
    path.join(apiDir, pkg, "typedoc-sidebar.cjs"),
    "utf8",
  )
  // Execute the CJS file in a minimal CommonJS sandbox to capture module.exports.
  const mod = { exports: {} as RawItem[] }
  // eslint-disable-next-line no-new-func
  new Function("module", "exports", src)(mod, mod.exports)
  return mod.exports
}

/**
 * Convert a typedoc doc id (e.g. "core/nodes/classes/Node") → URL slug,
 * prefixing the version segment for non-latest versions.
 */
function idToSlug(prefix: string[], id: string): string[] {
  return [...prefix, ...id.split("/")]
}

function convertItems(prefix: string[], items: RawItem[]): ApiSidebarItem[] {
  return items.map((item): ApiSidebarItem => {
    if (item.type === "doc") {
      return { type: "doc", slug: idToSlug(prefix, item.id), label: item.label }
    }
    const indexSlug =
      item.link?.type === "doc" ? idToSlug(prefix, item.link.id) : undefined
    return {
      type: "category",
      label: item.label,
      indexSlug,
      items: convertItems(prefix, item.items),
    }
  })
}

/** Flatten all kind-group categories into a single sorted list. */
function flattenByKind(prefix: string[], items: RawItem[]): ApiSidebarItem[] {
  const docs: ApiSidebarDoc[] = []
  const collect = (entries: RawItem[]) => {
    for (const e of entries) {
      if (e.type === "category") collect(e.items)
      else docs.push({ type: "doc", slug: idToSlug(prefix, e.id), label: e.label })
    }
  }
  collect(items)
  return docs.sort((a, b) => a.label.localeCompare(b.label))
}

// ── Public API ───────────────────────────────────────────────────────────────

// Packages and how their sidebar is rendered, per version. The latest tree is
// large and grouped; older snapshot versions just declare whatever packages
// they ship. A package not present on disk for a version is skipped.
const PACKAGES_BY_VERSION: Record<string, Array<{ label: string; pkg: string; flatten: boolean }>> = {
  default: [
    { label: "@motion-script/core", pkg: "core", flatten: false },
    { label: "@motion-script/code", pkg: "code", flatten: true },
    { label: "@motion-script/latex", pkg: "latex", flatten: true },
  ],
  "1.0.0": [
    { label: "@motion-script/core", pkg: "core", flatten: false },
  ],
}

function packagesFor(version: DocVersion) {
  return PACKAGES_BY_VERSION[version.version] ?? PACKAGES_BY_VERSION.default
}

const _packagesByVersion = new Map<string, ApiPackage[]>()

export function getApiPackages(version: DocVersion = LATEST_VERSION): ApiPackage[] {
  const cached = _packagesByVersion.get(version.version)
  if (cached) return cached

  const apiDir = versionApiDir(version)
  const prefix = versionPrefix(version)
  const packages = packagesFor(version)
    .filter(({ pkg }) => fs.existsSync(path.join(apiDir, pkg)))
    .map(({ label, pkg, flatten }) => {
      const raw = loadRawSidebar(apiDir, pkg)
      return {
        label,
        pkg,
        indexSlug: [...prefix, pkg],
        items: flatten ? flattenByKind(prefix, raw) : convertItems(prefix, raw),
      }
    })

  _packagesByVersion.set(version.version, packages)
  return packages
}

/** Default API landing slug for a version: its first package's index. */
export function getApiHomeSlug(version: DocVersion = LATEST_VERSION): string[] {
  const packages = getApiPackages(version)
  return packages[0]?.indexSlug ?? [...versionPrefix(version), "core"]
}

/** Flat list of every slug across all packages and versions (generateStaticParams). */
export function getAllApiSlugs(): string[][] {
  const slugs: string[][] = []

  function walkItems(items: ApiSidebarItem[]) {
    for (const item of items) {
      if (item.type === "doc") {
        slugs.push(item.slug)
      } else {
        if (item.indexSlug) slugs.push(item.indexSlug)
        walkItems(item.items)
      }
    }
  }

  for (const version of VERSIONS) {
    for (const pkg of getApiPackages(version)) {
      slugs.push(pkg.indexSlug) // package index page (e.g. core/index.md)
      walkItems(pkg.items)
    }
  }

  // Deduplicate (index pages may appear both as category link and via walkItems)
  const seen = new Set<string>()
  return slugs.filter((s) => {
    const key = s.join("/")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export interface ApiPageContent {
  content: string
  title: string
}

// `slug` is a `/api/...` URL slug; the version prefix (if any) is resolved and
// stripped before reading the typedoc markdown from that version's API dir.
export function getApiContent(slug: string[]): ApiPageContent | null {
  const { version, docSlug } = resolveVersionFromSlug(slug)
  if (docSlug.length === 0) return null
  const apiDir = versionApiDir(version)
  // Try <slug>.md then <slug>/index.md
  const candidates = [
    path.join(apiDir, ...docSlug) + ".md",
    path.join(apiDir, ...docSlug, "index.md"),
  ]
  for (const filePath of candidates) {
    try {
      const src = fs.readFileSync(filePath, "utf8").replace(/\r\n?/g, "\n")
      const titleMatch = src.match(/^#\s+(.+)$/m)
      const title = titleMatch ? titleMatch[1].replace(/\\</g, "<").replace(/\\>/g, ">") : docSlug[docSlug.length - 1]
      return { content: src, title }
    } catch {
      // try next
    }
  }
  return null
}

/** Does the same API page exist in `version`? Used by the old-version warning. */
export function apiPageExistsInVersion(version: DocVersion, docSlug: string[]): boolean {
  if (docSlug.length === 0) return false
  const apiDir = versionApiDir(version)
  return (
    fs.existsSync(path.join(apiDir, ...docSlug) + ".md") ||
    fs.existsSync(path.join(apiDir, ...docSlug, "index.md"))
  )
}
