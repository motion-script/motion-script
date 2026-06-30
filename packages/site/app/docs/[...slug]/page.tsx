import { notFound } from 'next/navigation'
import { compile, run } from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import rehypeSlug from 'rehype-slug'
import rehypeHighlight from 'rehype-highlight'

import { getAllDocSlugs, getDocContent, extractTocEntries } from '@/lib/docs'
import { preprocessMdx } from '@/lib/preprocess-mdx'
import { getMDXComponents } from '@/components/docs/mdx-components'
import { TocPortal } from '@/components/docs/TocPortal'

interface Props {
  params: Promise<{ slug: string[] }>
}

export async function generateStaticParams() {
  const slugs = getAllDocSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const doc = getDocContent(slug)
  if (!doc) return {}
  return { title: `${doc.meta.title} — MotionScript` }
}

export default async function DocsPage({ params }: Props) {
  const { slug } = await params
  const doc = getDocContent(slug)
  if (!doc) notFound()

  const tocEntries = extractTocEntries(doc.content)
  const processedSource = preprocessMdx(doc.content)

  const code = await compile(processedSource, {
    outputFormat: 'function-body',
    remarkPlugins: [remarkGfm, remarkFrontmatter],
    rehypePlugins: [rehypeSlug, rehypeHighlight],
  })

  const { default: MDXContent } = await run(String(code), {
    ...runtime,
    baseUrl: import.meta.url,
  })

  const components = getMDXComponents()

  // Find prev/next docs
  const allSlugs = getAllDocSlugs()
  const currentIndex = allSlugs.findIndex((s) => s.join('/') === slug.join('/'))
  const prevSlug = currentIndex > 0 ? allSlugs[currentIndex - 1] : null
  const nextSlug = currentIndex < allSlugs.length - 1 ? allSlugs[currentIndex + 1] : null

  return (
    <>
      <TocPortal entries={tocEntries} />
      <MDXContent components={components} />

      {/* Prev / Next navigation */}
      <nav className="mt-12 flex items-center justify-between border-t border-border pt-6 text-sm">
        {prevSlug ? (
          <a
            href={`/docs/${prevSlug.join('/')}`}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>←</span>
            <span>{prevSlug[prevSlug.length - 1].replace(/-/g, ' ')}</span>
          </a>
        ) : <span />}
        {nextSlug ? (
          <a
            href={`/docs/${nextSlug.join('/')}`}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>{nextSlug[nextSlug.length - 1].replace(/-/g, ' ')}</span>
            <span>→</span>
          </a>
        ) : <span />}
      </nav>
    </>
  )
}
