import React, { useState } from 'react';

const MANAGERS = [
  { label: 'npm', cmd: 'npm create @motion-script@latest' },
  { label: 'yarn', cmd: 'yarn create @motion-script' },
  { label: 'pnpm', cmd: 'pnpm create @motion-script@latest' },
] as const;

export default function CreateTerminal() {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(MANAGERS[active].cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="w-full max-w-lg rounded-xl overflow-hidden border border-border bg-[#18181a] shadow-2xl text-left text-sm">
      {/* Tab bar */}
      <div className="relative flex items-end gap-1 px-4 pt-3 border-b border-[var(--border)]">
        {MANAGERS.map((m, i) => (
          <button
            key={m.label}
            onClick={() => setActive(i)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: i === active ? '2px solid #7c6af7' : '2px solid transparent',
              borderRadius: 0,
              marginBottom: '-1px',
              padding: '0 8px 8px',
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 500,
              color: i === active ? '#e2e2e2' : '#6b6b7b',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { if (i !== active) (e.target as HTMLElement).style.color = '#aaaaaa'; }}
            onMouseLeave={e => { if (i !== active) (e.target as HTMLElement).style.color = '#6b6b7b'; }}
          >
            {m.label}
          </button>
        ))}
        <span className="ml-auto pb-2.5 text-xs font-sans text-[#6b6b7b]">bash</span>
      </div>

      {/* Terminal body */}
      <div className="px-5 py-4 flex items-center gap-2 font-mono">
        <span className="text-[#7c6af7] select-none">$</span>
        <span className="text-[#e2e2e2] flex-1">{MANAGERS[active].cmd}</span>
        <button
          onClick={copy}
          title="Copy"
          style={{
            background: 'none',
            border: 'none',
            borderRadius: '6px',
            padding: '6px',
            color: '#6b6b7b',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#e2e2e2'; (e.currentTarget as HTMLElement).style.background = '#2a2a2e'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#6b6b7b'; (e.currentTarget as HTMLElement).style.background = 'none'; }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#28c840" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
