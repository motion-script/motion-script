'use client'

import { useState } from 'react'

export interface TabPanel {
  label: string
  content: React.ReactNode
}

/**
 * Client tab switcher. Receives an already-extracted `panels` array (label +
 * content) rather than introspecting MDX `<TabItem>` children directly.
 *
 * The extraction happens in the *server* `Tabs` wrapper (see mdx-components):
 * `label`/`value` props on the `<TabItem>` elements are intact there, but they
 * are dropped when component-typed elements cross the Server → Client boundary,
 * so reading them here would yield `undefined`. `content` (a React node) does
 * serialize across the boundary, so the panel bodies still render fine.
 *
 * Visual style mirrors the landing page's CreateTerminal package-manager tabs.
 */
export function TabsClient({ panels }: { panels: TabPanel[] }) {
  const [active, setActive] = useState(0)
  if (!panels.length) return null

  return (
    <div className="terminal-chrome my-4 w-full rounded-xl overflow-hidden border border-border bg-[var(--terminal-bg)] text-left text-sm not-prose">
      {/* Tab bar — mirrors the landing page's CreateTerminal selector. */}
      <div className="relative flex items-end gap-1 px-4 pt-3 border-b border-border">
        {panels.map((panel, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: i === active ? '2px solid var(--terminal-accent)' : '2px solid transparent',
              borderRadius: 0,
              marginBottom: '-1px',
              padding: '0 8px 8px',
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 500,
              color: i === active ? 'var(--terminal-text)' : 'var(--terminal-text-muted)',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { if (i !== active) (e.target as HTMLElement).style.color = 'var(--terminal-text-hover)' }}
            onMouseLeave={(e) => { if (i !== active) (e.target as HTMLElement).style.color = 'var(--terminal-text-muted)' }}
          >
            {panel.label}
          </button>
        ))}
      </div>

      {/* Panel content. suppressHydrationWarning because the active tab differs server/client. */}
      <div
        suppressHydrationWarning
        className="px-5 py-4 [&_pre]:my-0 [&_pre]:border-0 [&_figure]:my-0 [&_:is(p,ul,ol):first-child]:mt-0 [&_:is(p,ul,ol):last-child]:mb-0"
      >
        {panels[active]?.content}
      </div>
    </div>
  )
}
