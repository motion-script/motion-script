// Server-safe MDX components map — no 'use client' here.
// Interactive sub-components (Tabs, CopyPre, canvas scenes) are client components imported below.

import { TabsClient, type TabPanel } from './TabsClient'
import { TerminalTabs, type TerminalTab } from './TerminalTabs'
import { CopyPre } from './CopyPre'
import {
  FirstSceneCanvas,
  AnimatingCanvas,
  LayoutCanvas,
  EffectsCanvas,
  MaskCanvas,
  TextMaskCanvas,
} from './getting-started-scenes'
import {
  TextCanvas,
  RichTextCanvas,
  RectCanvas,
  EllipseCanvas,
  PolygonCanvas,
  PolygramCanvas,
  LineGridCanvas,
  CameraCanvas,
  RowCanvas,
  ColumnCanvas,
  GridCanvas,
  ImageCanvas,
  VideoCanvas,
  PathCanvas,
  LatexCanvas,
  CodeCanvas,
} from './node-scenes'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MDXComponents = Record<string, any>

// Flatten a React node tree to its plain text (server-side; props are intact).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nodeText(node: any): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (typeof node === 'object' && 'props' in node) return nodeText(node.props?.children)
  return ''
}

// If a panel's body is a single fenced code block, return its raw command text.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function singleCodeBlockText(content: any): string | null {
  const node = Array.isArray(content) ? content.find((c) => c && typeof c === 'object') : content
  if (!node || typeof node !== 'object' || !('props' in node)) return null
  // <pre><code>…</code></pre> — the install snippets compile to exactly this.
  const inner = node.props?.children
  const code = inner && typeof inner === 'object' && 'props' in inner ? inner : node
  const cls: string = code?.props?.className ?? ''
  if (!/(^|\s)(hljs|language-)/.test(cls) && node.type !== 'pre') return null
  return nodeText(content).trimEnd()
}

// Server-side wrapper for Docusaurus <Tabs>. Runs before the RSC boundary while
// each <TabItem>'s `label`/`value` props are still intact, extracts them into a
// plain { label, content } array, and hands that to the client TabsClient.
// (Those props are dropped when component elements cross into a client
// component, so the extraction must happen here, server-side.)
//
// Special case: when every tab is a single shell code block (the package-manager
// install snippet), render the terminal-styled TerminalTabs instead so it
// matches the landing page rather than the generic tab panel.
function Tabs({ children }: { children?: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children]
  const panels: TabPanel[] = []
  const cmds: TerminalTab[] = []
  let allTerminal = true
  for (const child of arr) {
    if (!child || typeof child !== 'object' || !('props' in (child as object))) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (child as any).props ?? {}
    const label = props.label ?? props.value ?? `Tab ${panels.length + 1}`
    panels.push({ label, content: props.children })

    const cmd = singleCodeBlockText(props.children)
    if (cmd) cmds.push({ label, cmd })
    else allTerminal = false
  }

  if (allTerminal && cmds.length === panels.length && cmds.length > 0) {
    return <TerminalTabs tabs={cmds} />
  }
  return <TabsClient panels={panels} />
}

function TabItem({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function Admonition({ type, children }: { type: string; children?: React.ReactNode }) {
  const styles: Record<string, { border: string; bg: string; icon: string; label: string }> = {
    note:    { border: 'border-blue-500/40',   bg: 'bg-blue-500/5',   icon: 'ℹ',  label: 'Note'    },
    tip:     { border: 'border-green-500/40',  bg: 'bg-green-500/5',  icon: '💡', label: 'Tip'     },
    info:    { border: 'border-blue-400/40',   bg: 'bg-blue-400/5',   icon: 'ℹ',  label: 'Info'    },
    caution: { border: 'border-yellow-500/40', bg: 'bg-yellow-500/5', icon: '⚠',  label: 'Caution' },
    danger:  { border: 'border-red-500/40',    bg: 'bg-red-500/5',    icon: '⛔', label: 'Danger'  },
    warning: { border: 'border-yellow-500/40', bg: 'bg-yellow-500/5', icon: '⚠',  label: 'Warning' },
  }
  const s = styles[type] ?? styles.info
  return (
    <div className={`my-4 rounded-lg border ${s.border} ${s.bg} px-4 py-3`}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-70">{s.icon} {s.label}</p>
      <div className="text-sm [&>p]:m-0">{children}</div>
    </div>
  )
}

function InlineCode({ children }: { children?: React.ReactNode }) {
  return (
    <code className="rounded px-1.5 py-0.5 font-mono text-[0.875em] bg-muted/60 text-foreground">
      {children}
    </code>
  )
}

function BlockCode({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <code className={className}>{children}</code>
}

function Code({ children, className }: { children?: React.ReactNode; className?: string }) {
  // rehype-highlight rewrites the class to `hljs language-xxx`, so the
  // language marker is no longer the first token — match it anywhere.
  return className && /(^|\s)(hljs|language-)/.test(className)
    ? <BlockCode className={className}>{children}</BlockCode>
    : <InlineCode>{children}</InlineCode>
}

function Table({ children }: { children?: React.ReactNode }) {
  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

export function getMDXComponents(overrides?: MDXComponents): MDXComponents {
  return {
    // Docusaurus theme components. Tabs is a server wrapper that extracts panel
    // labels before delegating interactivity to the client TabsClient.
    Tabs,
    TabItem,

    // Admonitions
    Admonition,

    // Canvas illustrations — getting-started pages
    FirstSceneCanvas,
    AnimatingCanvas,
    LayoutCanvas,
    EffectsCanvas,
    MaskCanvas,
    MasksCanvas: MaskCanvas,
    TextMaskCanvas,

    // Canvas illustrations — node reference pages
    TextCanvas,
    RichTextCanvas,
    RectCanvas,
    EllipseCanvas,
    PolygonCanvas,
    PolygramCanvas,
    LineGridCanvas,
    CameraCanvas,
    RowCanvas,
    ColumnCanvas,
    GridCanvas,
    ImageCanvas,
    VideoCanvas,
    PathCanvas,
    LatexCanvas,
    CodeCanvas,

    // HTML elements
    code: Code,
    pre: CopyPre,
    table: Table,
    h1: ({ children }: { children?: React.ReactNode }) => <h1 className="mb-4 mt-0 text-3xl font-bold font-serif text-foreground">{children}</h1>,
    h2: ({ children, id }: { children?: React.ReactNode; id?: string }) => <h2 id={id} className="mb-3 mt-8 text-xl font-semibold text-foreground border-b border-border pb-2">{children}</h2>,
    h3: ({ children, id }: { children?: React.ReactNode; id?: string }) => <h3 id={id} className="mb-2 mt-6 text-lg font-semibold text-foreground">{children}</h3>,
    h4: ({ children, id }: { children?: React.ReactNode; id?: string }) => <h4 id={id} className="mb-2 mt-4 text-base font-semibold text-foreground">{children}</h4>,
    p: ({ children }: { children?: React.ReactNode }) => <p className="my-3 leading-7 text-foreground/90">{children}</p>,
    a: ({ children, href }: { children?: React.ReactNode; href?: string }) => <a href={href} className="text-primary underline underline-offset-2 hover:text-primary/80">{children}</a>,
    ul: ({ children }: { children?: React.ReactNode }) => <ul className="my-3 ml-6 list-disc space-y-1 text-foreground/90">{children}</ul>,
    ol: ({ children }: { children?: React.ReactNode }) => <ol className="my-3 ml-6 list-decimal space-y-1 text-foreground/90">{children}</ol>,
    li: ({ children }: { children?: React.ReactNode }) => <li className="leading-7">{children}</li>,
    blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote className="my-4 border-l-4 border-border pl-4 text-muted-foreground italic">{children}</blockquote>,
    hr: () => <hr className="my-8 border-border" />,
    strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-foreground">{children}</strong>,
    thead: ({ children }: { children?: React.ReactNode }) => <thead className="bg-muted/40">{children}</thead>,
    th: ({ children }: { children?: React.ReactNode }) => <th className="border-b border-border px-4 py-2 text-left font-semibold text-foreground">{children}</th>,
    td: ({ children }: { children?: React.ReactNode }) => <td className="border-b border-border px-4 py-2 text-foreground/80">{children}</td>,
    tr: ({ children }: { children?: React.ReactNode }) => <tr className="even:bg-muted/20">{children}</tr>,

    ...overrides,
  }
}
