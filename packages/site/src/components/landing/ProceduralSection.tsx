import React, { useState } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { CardShadow } from './FeatureFrame';

const SNIPPET = `export class HelloScene extends Scene {
  *build() {
    this.set({ fill: "#0D0F15", padding: 80 });

    const card = createRef<Rect>();

    this.add(
      <Rect ref={card} width={240} height={120} fill="#5ea8d8">
        <Text text="Hello" fontSize={32} fill="white" />
      </Rect>
    );

    // The execution of your code defines the animation
    yield* wait(0.5);
    yield* sequence(
      card().to({ cornerRadius: 60 }, 0.8, easeOutBack()),
      card().to({ rotation: 360 }, 0.8),
    );
  }
}`;

export default function ProceduralSection() {
  return (
    <section className="relative px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
      <div className="mx-auto w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        {/* Left: copy */}
        <div>
          <span className="inline-block mb-4 px-2.5 py-0.5 text-xs font-medium rounded-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--muted-foreground)]">
            Procedural
          </span>
          <h2 className="font-serif text-3xl md:text-4xl tracking-tight leading-[1.1] text-[var(--foreground)] mb-6">
            Procedural for a{' '}
            <span className="bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
              Change
            </span>
          </h2>
          <p className="text-base sm:text-lg text-[var(--muted-foreground)] leading-relaxed max-w-xl">
            Let the execution of your code define the animation. Write generator functions that
            describe what should happen — step by step.
          </p>
        </div>

        {/* Right: code snippet */}
        <CardShadow tilt className="relative rounded-2xl border border-[var(--border)] bg-[#17171C] overflow-hidden">
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[var(--border)]">
            <span className="w-3 h-3 rounded-full bg-red-400/70" />
            <span className="w-3 h-3 rounded-full bg-yellow-400/70" />
            <span className="w-3 h-3 rounded-full bg-green-400/70" />
            <span className="ml-3 text-xs text-[var(--muted-foreground)] font-mono">scene.ts</span>
            <CopyButton code={SNIPPET} />
          </div>
          <Highlight theme={themes.vsDark} code={SNIPPET} language="tsx">
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
              <pre
                className={`${className} relative m-0 p-4 sm:p-6 overflow-x-auto text-sm leading-relaxed font-mono`}
                style={{ ...style, background: 'transparent' }}
              >
                {tokens.map((line, i) => (
                  <div key={i} {...getLineProps({ line })}>
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        </CardShadow>
      </div>
    </section>
  );
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : 'Copy code'}
      className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--foreground)]/5 px-2.5 py-1 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--foreground)]/10 hover:text-[var(--foreground)]"
    >
      {copied ? (
        <CheckIcon className="h-3.5 w-3.5 text-green-400" />
      ) : (
        <CopyIcon className="h-3.5 w-3.5" />
      )}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CopyIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="9" y="9" width="11" height="11" rx="2" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15V5a2 2 0 012-2h10" />
    </svg>
  );
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
