import fs from "fs"
import path from "path"
import matter from "gray-matter"
import {
  VERSIONS,
  LATEST_VERSION,
  type DocVersion,
  resolveVersionFromSlug,
  versionContentDir,
  versionPrefix,
} from "./versions"

export interface DocMeta {
  slug: string[]
  title: string
  sidebar_position?: number
}

export interface SidebarCategory {
  type: "category"
  label: string
  position: number
  slug: string // the category folder slug
  description?: string
  items: SidebarItem[]
}

export interface SidebarDoc {
  type: "doc"
  label: string
  position: number
  slug: string[]
}

export type SidebarItem = SidebarCategory | SidebarDoc

function readFrontmatter(filePath: string): { title?: string; sidebar_position?: number } {
  try {
    const src = fs.readFileSync(filePath, "utf8")
    const { data } = matter(src)
    return data
  } catch {
    return {}
  }
}

function getTitleFromFile(filePath: string): string {
  try {
    const src = fs.readFileSync(filePath, "utf8")
    // Try frontmatter title first
    const { data, content } = matter(src)
    if (data.title) return data.title
    // Fall back to first H1 in content
    const match = content.match(/^#\s+(.+)$/m)
    if (match) return match[1].trim()
  } catch {
    // ignore
  }
  return path.basename(filePath, ".mdx")
}

function readCategory(dir: string): { label: string; position: number; description?: string } {
  const categoryPath = path.join(dir, "_category_.json")
  try {
    const raw = JSON.parse(fs.readFileSync(categoryPath, "utf8"))
    return {
      label: raw.label ?? path.basename(dir),
      position: raw.position ?? 99,
      description: raw.link?.description,
    }
  } catch {
    return { label: path.basename(dir), position: 99 }
  }
}

// `parentSlug` carries the URL slug built so far, including any leading version
// prefix, so the slugs produced here are ready to drop into `/docs/...`.
function buildItems(dir: string, parentSlug: string[]): SidebarItem[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const items: SidebarItem[] = []

  for (const entry of entries) {
    if (entry.name === "_category_.json") continue

    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      const cat = readCategory(fullPath)
      const folderSlug = entry.name
      const childItems = buildItems(fullPath, [...parentSlug, folderSlug])
      items.push({
        type: "category",
        label: cat.label,
        position: cat.position,
        description: cat.description,
        slug: folderSlug,
        items: childItems,
      })
    } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
      const stem = entry.name.replace(/\.mdx$/, "")
      const fm = readFrontmatter(fullPath)
      const title = getTitleFromFile(fullPath)
      items.push({
        type: "doc",
        label: title,
        position: fm.sidebar_position ?? 99,
        slug: [...parentSlug, stem],
      })
    }
  }

  return items.sort((a, b) => a.position - b.position)
}

// Sidebar for a specific version. Non-latest versions get their version id
// prefixed onto every doc slug so links resolve to /docs/<version>/...
export function getSidebar(version: DocVersion = LATEST_VERSION): SidebarItem[] {
  return buildItems(versionContentDir(version), versionPrefix(version))
}

// All URL slugs across every version (used by generateStaticParams). Each
// non-latest version's slugs carry the version prefix.
export function getAllDocSlugs(): string[][] {
  const slugs: string[][] = []

  function walk(dir: string, prefix: string[]) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return // version directory may not exist yet
    }
    for (const entry of entries) {
      if (entry.name === "_category_.json") continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath, [...prefix, entry.name])
      } else if (entry.name.endsWith(".mdx")) {
        const stem = entry.name.replace(/\.mdx$/, "")
        slugs.push([...prefix, stem])
      }
    }
  }

  for (const version of VERSIONS) {
    walk(versionContentDir(version), versionPrefix(version))
  }
  return slugs
}

// Slugs within a single version (no version prefix). Used to compute prev/next
// navigation, which must stay inside the active version.
export function getDocSlugsForVersion(version: DocVersion): string[][] {
  const slugs: string[][] = []

  function walk(dir: string, prefix: string[]) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === "_category_.json") continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath, [...prefix, entry.name])
      } else if (entry.name.endsWith(".mdx")) {
        const stem = entry.name.replace(/\.mdx$/, "")
        slugs.push([...prefix, stem])
      }
    }
  }

  walk(versionContentDir(version), [])
  return slugs
}

// Absolute file path for a version-local doc slug (no version prefix).
function docFilePath(version: DocVersion, docSlug: string[]): string {
  return path.join(versionContentDir(version), ...docSlug.slice(0, -1), docSlug[docSlug.length - 1] + ".mdx")
}

// Does the same doc path exist in `version`? Used by the old-version warning to
// link to the equivalent page in the latest version when one is available.
export function docExistsInVersion(version: DocVersion, docSlug: string[]): boolean {
  if (docSlug.length === 0) return false
  return fs.existsSync(docFilePath(version, docSlug))
}

export interface TocEntry {
  id: string
  text: string
  depth: 2 | 3
}

// slugify must match rehype-slug behaviour (lowercase, collapse spaces/special chars to hyphens)
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
}

export function extractTocEntries(markdown: string): TocEntry[] {
  const entries: TocEntry[] = []
  for (const line of markdown.split('\n')) {
    const m2 = line.match(/^##\s+(.+)$/)
    const m3 = line.match(/^###\s+(.+)$/)
    if (m2) entries.push({ id: slugify(m2[1].trim()), text: m2[1].trim(), depth: 2 })
    else if (m3) entries.push({ id: slugify(m3[1].trim()), text: m3[1].trim(), depth: 3 })
  }
  return entries
}

export interface BreadcrumbEntry {
  label: string
  href?: string
}

// Build breadcrumb trail for a `/docs/...` URL slug: category folder labels
// followed by the doc title. The version prefix (if any) is stripped before
// resolving folders against the version's content dir, then re-applied to the
// category links so they stay within the active version. Intermediate folders
// link to their first child doc (folders have no index page); the final entry
// (the current doc) has no href.
export function getBreadcrumbs(slug: string[]): BreadcrumbEntry[] {
  const { version, docSlug } = resolveVersionFromSlug(slug)
  const prefix = versionPrefix(version)
  const root = versionContentDir(version)
  const entries: BreadcrumbEntry[] = []

  for (let i = 0; i < docSlug.length - 1; i++) {
    const dir = path.join(root, ...docSlug.slice(0, i + 1))
    const cat = readCategory(dir)
    const firstChild = firstChildSlug(version, docSlug.slice(0, i + 1))
    entries.push({
      label: cat.label,
      href: firstChild ? "/docs/" + [...prefix, ...firstChild].join("/") : undefined,
    })
  }

  const doc = getDocContent(slug)
  entries.push({ label: doc?.meta.title ?? docSlug[docSlug.length - 1] })

  return entries
}

// First doc slug (version-local) inside a category folder, by sidebar position.
// buildItems produces fully-qualified slugs, so build without a prefix here and
// let callers re-apply the version prefix.
function firstChildSlug(version: DocVersion, folderSlug: string[]): string[] | null {
  const dir = path.join(versionContentDir(version), ...folderSlug)
  return firstDocInItems(buildItems(dir, folderSlug))
}

function firstDocInItems(items: SidebarItem[]): string[] | null {
  for (const item of items) {
    if (item.type === "doc") return item.slug
    const nested = firstDocInItems(item.items)
    if (nested) return nested
  }
  return null
}

// `slug` is a `/docs/...` URL slug; the version prefix (if any) is resolved and
// stripped before reading the file. The returned meta.slug is the original URL
// slug so callers can build links back to this page.
export function getDocContent(slug: string[]): { content: string; meta: DocMeta } | null {
  const { version, docSlug } = resolveVersionFromSlug(slug)
  if (docSlug.length === 0) return null
  const filePath = docFilePath(version, docSlug)
  try {
    const src = fs.readFileSync(filePath, "utf8")
    const { data, content } = matter(src)
    const title = data.title ?? content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? docSlug[docSlug.length - 1]
    return {
      content,
      meta: {
        slug,
        title,
        sidebar_position: data.sidebar_position,
      },
    }
  } catch {
    return null
  }
}
