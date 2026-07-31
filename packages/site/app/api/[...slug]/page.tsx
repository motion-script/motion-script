import { notFound } from 'next/navigation'
import { compile, run } from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeHighlight from 'rehype-highlight'

import { getAllApiSlugs, getApiContent, apiPageExistsInVersion, getApiHomeSlug } from '@/lib/api'
import { getMDXComponents } from '@/components/docs/mdx-components'
import { TocPortal } from '@/components/docs/TocPortal'
import { extractTocEntries } from '@/lib/docs'
import { resolveVersionFromSlug, LATEST_VERSION, versionedApiHref } from '@/lib/versions'
import VersionWarning from '@/components/docs/VersionWarning'

interface Props {
  params: Promise<{ slug: string[] }>
}

export async function generateStaticParams() {
  const slugs = getAllApiSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const page = getApiContent(slug)
  if (!page) return {}
  return { title: `${page.title} — MotionScript API` }
}

export default async function ApiPage({ params }: Props) {
  const { slug } = await params
  const page = getApiContent(slug)
  if (!page) notFound()

  const tocEntries = extractTocEntries(page.content)

  // Old-version warning: on every API page of a non-latest version, point users
  // to the equivalent page in the latest API when it exists, else the latest
  // API home (first package index). The slug carries the version prefix, so
  // docSlug is the version-local path used to look up the latest equivalent.
  const { version, docSlug } = resolveVersionFromSlug(slug)
  const isOldVersion = !version.latest
  const hasEquivalent = isOldVersion && apiPageExistsInVersion(LATEST_VERSION, docSlug)
  const latestHref = hasEquivalent
    ? versionedApiHref(LATEST_VERSION, docSlug)
    : '/api/' + getApiHomeSlug(LATEST_VERSION).join('/')

  // Rewrite relative .md links to absolute /api/ paths before compiling.
  // Links look like: [Label](../../signals/interfaces/SignalHost.md)
  // The file lives at api/<pkg>/<...rest>.md, so we compute the absolute
  // api path by resolving relative to the current slug directory.
  const slugDir = slug.slice(0, -1) // directory portion of the current page
  const rewritten = page.content.replace(
    /\]\(([^)]+\.md(?:#[^)]*)?)\)/g,
    (match, href: string) => {
      // Leave absolute URLs and anchor-only refs untouched
      if (href.startsWith('http') || href.startsWith('#')) return match

      const [mdPath, anchor] = href.split('#') as [string, string | undefined]
      // Resolve the .md path relative to the current slug's directory
      const parts = [...slugDir, ...mdPath.split('/')]
      const resolved: string[] = []
      for (const p of parts) {
        if (p === '..') resolved.pop()
        else if (p !== '.') resolved.push(p)
      }
      // Strip trailing .md
      const withoutExt = resolved.join('/').replace(/\.md$/, '')
      const href2 = `/api/${withoutExt}${anchor ? '#' + anchor : ''}`
      return `](${href2})`
    },
  )

  // `format: 'md'` compiles these as plain markdown rather than MDX. Typedoc
  // output is full of literal braces and angle brackets in prose (`= { x, y }`,
  // `Signal<T>`) and of indented code blocks, and MDX would read the first as
  // JSX expressions and refuse the second, which it dropped support for. The
  // component map and the rest of the pipeline are unchanged.
  const code = await compile(rewritten, {
    format: 'md',
    outputFormat: 'function-body',
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeSlug, rehypeHighlight],
  })

  const { default: MDXContent } = await run(String(code), {
    ...runtime,
    baseUrl: import.meta.url,
  })

  const components = getMDXComponents()

  return (
    <>
      <TocPortal entries={tocEntries} />
      {isOldVersion && (
        <VersionWarning
          current={version}
          latest={LATEST_VERSION}
          href={latestHref}
          isEquivalent={hasEquivalent}
          equivalentLabel="View this page in the latest API"
          fallbackLabel="Go to the latest API reference"
        />
      )}
      <MDXContent components={components} />
    </>
  )
}
