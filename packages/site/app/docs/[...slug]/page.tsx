import { notFound } from 'next/navigation'
import { compile, run } from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import rehypeSlug from 'rehype-slug'
import rehypeHighlight from 'rehype-highlight'

import { getAllDocSlugs, getDocSlugsForVersion, getDocContent, extractTocEntries, getBreadcrumbs, docExistsInVersion, getDocSourcePath } from '@/lib/docs'
import { resolveVersionFromSlug, versionPrefix, LATEST_VERSION, versionedHref } from '@/lib/versions'
import { preprocessMdx } from '@/lib/preprocess-mdx'
import { getMDXComponents } from '@/components/docs/mdx-components'
import { TocPortal } from '@/components/docs/TocPortal'
import Breadcrumbs from '@/components/docs/Breadcrumbs'
import VersionWarning from '@/components/docs/VersionWarning'

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
  const sourcePath = getDocSourcePath(slug)
  const editUrl = sourcePath
    ? `https://github.com/motion-script/motion-script/edit/main/${sourcePath}`
    : null
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

  const breadcrumbs = getBreadcrumbs(slug)

  // Find prev/next docs — navigation stays within the active version. Slugs from
  // getDocSlugsForVersion are version-local, so compare and re-prefix with the
  // version segment to keep the active version when linking.
  const { version, docSlug } = resolveVersionFromSlug(slug)
  const prefix = versionPrefix(version)
  const versionSlugs = getDocSlugsForVersion(version)
  const currentIndex = versionSlugs.findIndex((s) => s.join('/') === docSlug.join('/'))
  const prevDoc = currentIndex > 0 ? versionSlugs[currentIndex - 1] : null
  const nextDoc = currentIndex >= 0 && currentIndex < versionSlugs.length - 1 ? versionSlugs[currentIndex + 1] : null
  const prevSlug = prevDoc ? [...prefix, ...prevDoc] : null
  const nextSlug = nextDoc ? [...prefix, ...nextDoc] : null

  // Old-version warning: on every page of a non-latest version, point users to
  // the equivalent page in the latest version when it exists, else Getting
  // Started (latest intro).
  const isOldVersion = !version.latest
  const hasEquivalent = isOldVersion && docExistsInVersion(LATEST_VERSION, docSlug)
  const latestHref = hasEquivalent ? versionedHref(LATEST_VERSION, docSlug) : versionedHref(LATEST_VERSION, ['intro'])

  return (
    <>
      <TocPortal entries={tocEntries} editUrl={editUrl} />
      <Breadcrumbs entries={breadcrumbs} />
      {isOldVersion && (
        <VersionWarning
          current={version}
          latest={LATEST_VERSION}
          href={latestHref}
          isEquivalent={hasEquivalent}
        />
      )}
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
