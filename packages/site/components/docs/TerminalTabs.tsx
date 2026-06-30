'use client'

import { useState } from 'react'

export interface TerminalTab {
  /** Tab label, e.g. "npm". */
  label: string
  /** The shell command shown for this tab. */
  cmd: string
}

/**
 * Terminal-styled tab selector for shell commands — the package-manager install
 * snippet in the docs. Visually matches the landing page's CreateTerminal:
 * a dark window with a tabbed header, a `$` prompt, a shell label, and a copy
 * button. Driven by a `tabs` array so it can be reused (docs install snippet,
 * landing hero, etc.) instead of the generic MDX <Tabs>.
 */
export function TerminalTabs({ tabs, shell = 'bash' }: { tabs: TerminalTab[]; shell?: string }) {
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState(false)
  if (!tabs.length) return null

  function copy() {
    navigator.clipboard.writeText(tabs[active].cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="terminal-chrome my-4 w-full rounded-xl overflow-hidden border border-border bg-[var(--terminal-bg)] text-left text-sm not-prose">
      <div className="relative flex items-end gap-1 px-4 pt-3 border-b border-border">
        {tabs.map((t, i) => (
          <button
            key={t.label}
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
            {t.label}
          </button>
        ))}
        <span className="ml-auto pb-2.5 text-xs font-sans text-[var(--terminal-text-muted)]">{shell}</span>
      </div>

      <div className="px-5 py-4 flex items-center gap-2 font-mono">
        <span className="text-[var(--terminal-accent)] select-none">$</span>
        <span className="text-[var(--terminal-text)] flex-1" suppressHydrationWarning>{tabs[active].cmd}</span>
        <button
          onClick={copy}
          title="Copy"
          style={{
            background: 'none',
            border: 'none',
            borderRadius: '6px',
            padding: '6px',
            color: 'var(--terminal-text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--terminal-text)'; (e.currentTarget as HTMLElement).style.background = 'var(--terminal-hover-bg)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--terminal-text-muted)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  )
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#28c840" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
