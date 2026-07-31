import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const BLOG_DIR = path.join(process.cwd(), 'content/blog')

export interface BlogAuthor {
  name: string
  title?: string
  url?: string
  image_url?: string
}

export interface BlogMeta {
  slug: string
  title: string
  date: string
  authors: BlogAuthor[]
  tags: string[]
  description?: string
}

export interface BlogPost {
  meta: BlogMeta
  content: string
  excerpt: string
}

function formatDate(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function getExcerpt(content: string): string {
  // Use content before {/* truncate */} if present
  const truncateIdx = content.indexOf('{/* truncate */}')
  const raw = truncateIdx !== -1 ? content.slice(0, truncateIdx) : content

  // Strip markdown: headers, bold/italic, code blocks, links
  const stripped = raw
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()

  return stripped.length > 200 ? stripped.slice(0, 200).trimEnd() + '…' : stripped
}

function readPost(filePath: string): BlogPost | null {
  try {
    // Normalise CRLF up front — posts authored on Windows otherwise carry a
    // trailing `\r` on every line, which breaks line-anchored markdown parsing
    // downstream (see readSource in lib/docs.ts).
    const src = fs.readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n')
    const { data, content } = matter(src)

    const slug: string = data.slug ?? path.basename(filePath, '.mdx').replace(/^\d{4}-\d{2}-\d{2}-/, '')

    const authors: BlogAuthor[] = Array.isArray(data.authors)
      ? data.authors.map((a: BlogAuthor | string) =>
          typeof a === 'string' ? { name: a } : a,
        )
      : []

    return {
      meta: {
        slug,
        title: data.title ?? '',
        date: data.date ? formatDate(data.date) : '',
        authors,
        tags: data.tags ?? [],
        description: data.description,
      },
      content,
      excerpt: data.description ?? getExcerpt(content),
    }
  } catch {
    return null
  }
}

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) return []

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.mdx'))
    .sort()
    .reverse()

  return files.map((f) => readPost(path.join(BLOG_DIR, f))).filter(Boolean) as BlogPost[]
}

export function getPost(slug: string): BlogPost | null {
  if (!fs.existsSync(BLOG_DIR)) return null

  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.mdx'))
  for (const file of files) {
    const post = readPost(path.join(BLOG_DIR, file))
    if (post && post.meta.slug === slug) return post
  }
  return null
}

export function getAllBlogSlugs(): string[] {
  return getAllPosts().map((p) => p.meta.slug)
}
