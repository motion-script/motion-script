'use client'

import { useState, useMemo } from 'react'
import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'

// The TypeScript grammar delegates JSX/TSX markup to the `xml` sub-language, so
// without `xml` registered the tags in `<Node .../>` snippets stay uncolored
// (everything else highlights). rehype-highlight registers the full bundle,
// which is why regular markdown code blocks don't show the gap.
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('tsx', typescript)

function highlight(code: string) {
  return hljs.highlight(code.trim(), { language: 'tsx' }).value
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code.trim())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  return (
    <button
      onClick={copy}
      className="absolute right-3 top-3 z-10 rounded-md border border-border/60 bg-background/80 px-2 py-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
    >
      {copied ? '✓' : 'Copy'}
    </button>
  )
}

// Just the highlighted code block (no border / rounding), for embedding inside
// the SceneCanvas card where the card itself owns the chrome. `className` lets
// the caller control the <pre> shape (rounded corners for one side, etc.).
export function CodePanel({ code, className = '' }: { code: string; className?: string }) {
  const html = useMemo(() => highlight(code), [code])
  return (
    <figure className="group relative m-0">
      <pre
        className={`overflow-auto bg-muted/50 p-4 text-sm leading-relaxed font-mono ${className}`}
      >
        <code className="hljs language-tsx" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
      <CopyButton code={code} />
    </figure>
  )
}

// Standalone collapsible "View scene code" disclosure (kept for any caller that
// wants the old toggle behaviour). SceneCanvas now uses the hover overlay
// + CodePanel instead.
export function SceneCode({ code }: { code: string }) {
  const [open, setOpen] = useState(false)
  const html = useMemo(() => highlight(code), [code])

  return (
    <div className="-mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="font-mono opacity-70">{'</>'}</span>
        {open ? 'Hide scene code' : 'View scene code'}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <figure className="group relative mt-2 m-0">
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 text-sm leading-relaxed font-mono">
            <code
              className="hljs language-tsx"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </pre>
          <CopyButton code={code} />
        </figure>
      )}
    </div>
  )
}
