'use client'

import { useState } from 'react'

function getText(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(getText).join('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (node && typeof node === 'object' && 'props' in (node as any)) return getText((node as any).props?.children)
  return ''
}

export function CopyPre({ children }: { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(getText(children).trimEnd())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <figure className="group relative my-4 m-0">
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 text-sm leading-relaxed font-mono">
        {children}
      </pre>
      <button
        onClick={copy}
        className="absolute right-3 top-3 rounded-md border border-border/60 bg-background/80 px-2 py-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
      >
        {copied ? '✓' : 'Copy'}
      </button>
    </figure>
  )
}
