import React from 'react';
import { useInView } from './useInView';
import LayoutCanvas from './LayoutCanvas';
import NumberCanvas from './NumberCanvas';
import EffectsCanvas from './EffectsCanvas';
import CodeCanvas from './CodeCanvas';
import FeatureFrame, { CardShadow, LiveChip } from './FeatureFrame';

/**
 * Features section. Rather than four identical alternating rows, features are
 * arranged as a bento composition that varies rhythm and weight:
 *
 *   1. a wide hero row (Code) — large demo + copy + a divided "capability" list;
 *   2. a 2-up bento (Layout, Text) — compact cards, demo over copy + tag chips;
 *   3. a wide showcase (Effects) — full-bleed demo with copy and tag chips.
 *
 * Capabilities are shown as tag chips / a divided list instead of checkmark
 * bullets, which read as a feature spec rather than a generic to-do list.
 *
 * `--glow` (an "r g b" triplet) tints each card's hover border per feature; the
 * cards sit on a faint `.card-floor` shadow (see CardShadow).
 */

// "r g b" triplets feeding `rgb(var(--glow) / a)` in the card CSS.
const GLOW = {
  indigo: '99 102 241',
  purple: '168 85 247',
  pink: '236 72 153',
  cyan: '34 211 238',
} as const;

/** Small rounded tag used to list a feature's capabilities. */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--foreground)]/[0.04] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:border-[var(--foreground)]/20 hover:text-[var(--foreground)]">
      {children}
    </span>
  );
}

/** Section eyebrow badge, reused across rows. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block mb-4 px-2.5 py-0.5 text-xs font-medium rounded-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--muted-foreground)]">
      {children}
    </span>
  );
}

/** Wrapper that fades + blur-reveals its children when scrolled into view. */
function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const [ref, isInView] = useInView<HTMLDivElement>({ once: true, margin: '-80px' });
  return (
    <div
      ref={ref}
      style={{ '--reveal-delay': `${delay}s` } as React.CSSProperties}
      className={`reveal-focus${isInView ? ' is-visible' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

// ── Hero row: Code ───────────────────────────────────────────────────────────
function CodeHero() {
  const capabilities = [
    { k: 'TypeScript', v: 'Component-driven animations, fully typed' },
    { k: 'Instant preview', v: 'Vite hot-reloads every change live' },
    { k: 'Git-friendly', v: 'Readable diffs you can actually review' },
  ];

  return (
    <Reveal>
      <CardShadow
        tilt
        style={{ '--glow': GLOW.purple } as React.CSSProperties}
        className="feature-card grid grid-cols-1 items-center gap-8 rounded-2xl border border-[var(--border)] bg-[#16151a] p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:p-10"
      >
        {/* Copy + capability list */}
        <div className="order-2 lg:order-1">
          <Eyebrow>Code-first</Eyebrow>
          <h3 className="mb-3 font-serif text-3xl font-bold text-[var(--foreground)] sm:text-4xl">
            Animate with <span className="font-code">CODE</span>
          </h3>
          <p className="mb-8 max-w-lg text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-base">
            Describe motion the way you describe logic. Compose animations in TypeScript
            with full type-safety, reuse components, and let Vite stream every change
            into a live preview.
          </p>

          <dl className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {capabilities.map((c) => (
              <div key={c.k} className="flex items-baseline gap-4 py-3">
                <dt className="w-32 shrink-0 text-sm font-semibold text-[var(--foreground)]">
                  {c.k}
                </dt>
                <dd className="text-sm text-[var(--muted-foreground)]">{c.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Live demo */}
        <div className="order-1 lg:order-2">
          <FeatureFrame
            chip={<LiveChip label="scene.ts · live" />}
            className="aspect-video rounded-xl bg-[var(--background)]"
          >
            <CodeCanvas />
          </FeatureFrame>
        </div>
      </CardShadow>
    </Reveal>
  );
}

// ── Bento cell: demo over copy + tags ────────────────────────────────────────
function BentoCard({
  glow,
  eyebrow,
  title,
  description,
  tags,
  chip,
  delay,
  children,
}: {
  glow: string;
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  tags: string[];
  chip?: React.ReactNode;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <CardShadow
        tilt
        style={{ '--glow': glow } as React.CSSProperties}
        className="feature-card flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[#16151a]"
      >
        <FeatureFrame chip={chip} className="aspect-video bg-[var(--background)]">
          {children}
        </FeatureFrame>
        <div className="flex flex-1 flex-col p-6 sm:p-7">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h3 className="mb-2 font-serif text-2xl font-bold text-[var(--foreground)]">{title}</h3>
          <p className="mb-5 text-sm leading-relaxed text-[var(--muted-foreground)]">
            {description}
          </p>
          <div className="mt-auto flex flex-wrap gap-2">
            {tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        </div>
      </CardShadow>
    </Reveal>
  );
}

// ── Wide showcase: Effects ─────────────────────────────────────────────────────
function EffectsShowcase() {
  return (
    <Reveal>
      <CardShadow
        tilt
        style={{ '--glow': GLOW.cyan } as React.CSSProperties}
        className="feature-card grid grid-cols-1 items-stretch gap-8 overflow-hidden rounded-2xl border border-[var(--border)] bg-[#16151a] p-6 sm:p-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12 lg:p-10"
      >
        {/* Copy */}
        <div className="flex flex-col justify-center">
          <Eyebrow>GPU effects</Eyebrow>
          <h3 className="mb-3 font-serif text-3xl font-bold text-[var(--foreground)] sm:text-4xl">
            Custom SkSL Shaders
          </h3>
          <p className="mb-6 max-w-lg text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-base">
            Author GPU shader effects in SkSL and apply them to any node. From vignettes
            and ripples to chromatic aberration — real-time visuals that animate frame by
            frame.
          </p>
          <div className="flex flex-wrap gap-2">
            {['SkSL shaders', 'Stackable', 'Animatable uniforms', 'Real-time'].map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        </div>

        {/* Live demo */}
        <FeatureFrame
          chip={<span className="text-white/80">Chromatic Aberration</span>}
          className="aspect-video rounded-xl bg-[var(--background)] lg:min-h-[20rem]"
        >
          <EffectsCanvas />
        </FeatureFrame>
      </CardShadow>
    </Reveal>
  );
}

export default function FeaturesSection() {
  const [ref, isInView] = useInView<HTMLDivElement>({ once: true, margin: '-100px' });

  return (
    <section id="features" className="relative px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div
          ref={ref}
          className={`reveal-up${isInView ? ' is-visible' : ''} mb-16 text-center sm:mb-20`}
        >
          <Eyebrow>Features</Eyebrow>
          <h2 className="mb-4 font-serif text-3xl font-bold text-[var(--foreground)] sm:text-4xl md:text-5xl">
            Everything you need to{' '}
            <span className="bg-gradient-to-r from-indigo-500 to-blue-400 bg-clip-text font-code text-transparent">
              CREATE
            </span>
          </h2>
          <p className="!mx-auto max-w-2xl text-center text-base text-[var(--muted-foreground)] sm:text-lg">
            A complete toolkit for motion designers and creative developers. From vector
            shapes to GPU shaders, all driven by code.
          </p>
        </div>

        {/* Bento composition */}
        <div className="space-y-8">
          <CodeHero />

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <BentoCard
              glow={GLOW.indigo}
              eyebrow="Layout"
              title="Flexbox Layouts"
              description="Lay out scenes with a familiar flexbox model — rows, columns, gaps, wrapping — and watch everything reflow as your content animates."
              tags={['Flexbox engine', 'Auto reflow', 'Nestable']}
              chip={<LiveChip label="reflowing" />}
            >
              <LayoutCanvas />
            </BentoCard>

            <BentoCard
              glow={GLOW.pink}
              eyebrow="Text"
              title="Text Animation"
              description="A full text engine built for motion: animate variable-font axes, paint glyphs with gradient and image fills, stroke and dash letterforms, and autosize to fit."
              tags={['Variable fonts', 'Rich fills', 'Dashed strokes', 'Autosize']}
              chip={<LiveChip label="text on path" />}
              delay={0.08}
            >
              <NumberCanvas />
            </BentoCard>
          </div>

          <EffectsShowcase />
        </div>
      </div>
    </section>
  );
}
