// Transform Docusaurus MDX to plain MDX compatible with @mdx-js/mdx.
// - Strip @theme/... and @site/... import lines (components provided via MDXComponents)
// - Convert :::type ... ::: admonition blocks to <Admonition type="..."> JSX
export function preprocessMdx(src: string): string {
  let out = src
    .split('\n')
    .filter((line) => {
      if (/^\s*import\s+.*from\s+['"]@theme\//.test(line)) return false
      if (/^\s*import\s+.*from\s+['"]@site\//.test(line)) return false
      return true
    })
    .join('\n')

  // Convert :::type\n...\n::: to <Admonition type="type">...</Admonition>
  out = out.replace(
    /^:::(note|tip|info|caution|danger|warning)(?: [^\n]*)?\n([\s\S]*?)^:::/gm,
    (_, type: string, body: string) => {
      const trimmed = body.trimEnd()
      return `<Admonition type="${type}">\n\n${trimmed}\n\n</Admonition>`
    },
  )

  return out
}
