import fs from "fs"
import path from "path"
import matter from "gray-matter"

const DOCS_DIR = path.join(process.cwd(), "content/docs")

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

export function getSidebar(): SidebarItem[] {
  return buildItems(DOCS_DIR, [])
}

export function getAllDocSlugs(): string[][] {
  const slugs: string[][] = []

  function walk(dir: string, prefix: string[]) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
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

  walk(DOCS_DIR, [])
  return slugs
}

export function getDocFilePath(slug: string[]): string {
  return path.join(DOCS_DIR, ...slug.slice(0, -1), slug[slug.length - 1] + ".mdx")
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

export function getDocContent(slug: string[]): { content: string; meta: DocMeta } | null {
  const filePath = getDocFilePath(slug)
  try {
    const src = fs.readFileSync(filePath, "utf8")
    const { data, content } = matter(src)
    const title = data.title ?? content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? slug[slug.length - 1]
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
