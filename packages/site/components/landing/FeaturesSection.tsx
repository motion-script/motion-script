'use client'

import { useInView } from './useInView'
import LayoutCanvas from './LayoutCanvas'
import NumberCanvas from './NumberCanvas'
import EffectsCanvas from './EffectsCanvas'
import CodeCanvas from './CodeCanvas'
import FeatureFrame, { CardShadow, LiveChip } from './FeatureFrame'

const GLOW = {
  indigo: '99 102 241',
  purple: '168 85 247',
  pink: '236 72 153',
  cyan: '34 211 238',
} as const

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-foreground/[0.04] px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground">
      {children}
    </span>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block mb-4 px-2.5 py-0.5 text-xs font-medium rounded-full bg-foreground/5 border border-border text-muted-foreground">
      {children}
    </span>
  )
}

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const [ref, isInView] = useInView<HTMLDivElement>({ once: true, margin: '-80px' })
  return (
    <div
      ref={ref}
      style={{ '--reveal-delay': `${delay}s` } as React.CSSProperties}
      className={`reveal-focus${isInView ? ' is-visible' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

function CodeHero() {
  const capabilities = [
    { k: 'TypeScript', v: 'Component-driven animations, fully typed' },
    { k: 'Instant preview', v: 'Vite hot-reloads every change live' },
    { k: 'Git-friendly', v: 'Readable diffs you can actually review' },
  ]

  return (
    <Reveal>
      <CardShadow
        tilt
        style={{ '--glow': GLOW.purple } as React.CSSProperties}
        className="feature-card grid grid-cols-1 items-center gap-8 rounded-2xl border border-border bg-[#16151a] p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:p-10"
      >
        <div className="order-2 lg:order-1">
          <Eyebrow>Code-first</Eyebrow>
          <h3 className="mb-3 font-serif text-3xl font-bold text-foreground sm:text-4xl">
            Animate with <span className="font-code">CODE</span>
          </h3>
          <p className="mb-8 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            Describe motion the way you describe logic. Compose animations in TypeScript
            with full type-safety, reuse components, and let Vite stream every change
            into a live preview.
          </p>

          <dl className="divide-y divide-border border-y border-border">
            {capabilities.map((c) => (
              <div key={c.k} className="flex items-baseline gap-4 py-3">
                <dt className="w-32 shrink-0 text-sm font-semibold text-foreground">{c.k}</dt>
                <dd className="text-sm text-muted-foreground">{c.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="order-1 lg:order-2">
          <FeatureFrame chip={<LiveChip label="scene.ts · live" />} className="aspect-video rounded-xl bg-background">
            <CodeCanvas />
          </FeatureFrame>
        </div>
      </CardShadow>
    </Reveal>
  )
}

function BentoCard({
  glow, eyebrow, title, description, tags, chip, delay, children,
}: {
  glow: string; eyebrow: string; title: React.ReactNode; description: string
  tags: string[]; chip?: React.ReactNode; delay?: number; children: React.ReactNode
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <CardShadow
        tilt
        style={{ '--glow': glow } as React.CSSProperties}
        className="feature-card flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-[#16151a]"
      >
        <FeatureFrame chip={chip} className="aspect-video bg-background">
          {children}
        </FeatureFrame>
        <div className="flex flex-1 flex-col p-6 sm:p-7">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h3 className="mb-2 font-serif text-2xl font-bold text-foreground">{title}</h3>
          <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{description}</p>
          <div className="mt-auto flex flex-wrap gap-2">
            {tags.map((t) => <Tag key={t}>{t}</Tag>)}
          </div>
        </div>
      </CardShadow>
    </Reveal>
  )
}

function EffectsShowcase() {
  return (
    <Reveal>
      <CardShadow
        tilt
        style={{ '--glow': GLOW.cyan } as React.CSSProperties}
        className="feature-card grid grid-cols-1 items-stretch gap-8 overflow-hidden rounded-2xl border border-border bg-[#16151a] p-6 sm:p-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12 lg:p-10"
      >
        <div className="flex flex-col justify-center">
          <Eyebrow>GPU effects</Eyebrow>
          <h3 className="mb-3 font-serif text-3xl font-bold text-foreground sm:text-4xl">
            Custom SkSL Shaders
          </h3>
          <p className="mb-6 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            Author GPU shader effects in SkSL and apply them to any node. From vignettes
            and ripples to chromatic aberration — real-time visuals that animate frame by frame.
          </p>
          <div className="flex flex-wrap gap-2">
            {['SkSL shaders', 'Stackable', 'Animatable uniforms', 'Real-time'].map((t) => <Tag key={t}>{t}</Tag>)}
          </div>
        </div>

        <FeatureFrame
          chip={<span className="text-white/80">Chromatic Aberration</span>}
          className="aspect-video rounded-xl bg-background lg:min-h-[20rem]"
        >
          <EffectsCanvas />
        </FeatureFrame>
      </CardShadow>
    </Reveal>
  )
}

export default function FeaturesSection() {
  const [ref, isInView] = useInView<HTMLDivElement>({ once: true, margin: '-100px' })

  return (
    <section id="features" className="relative px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div ref={ref} className={`reveal-up${isInView ? ' is-visible' : ''} mb-16 text-center sm:mb-20`}>
          <Eyebrow>Features</Eyebrow>
          <h2 className="mb-4 font-serif text-3xl font-bold text-foreground sm:text-4xl md:text-5xl">
            Everything you need to{' '}
            <span className="bg-gradient-to-r from-indigo-500 to-blue-400 bg-clip-text font-code text-transparent">
              CREATE
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-center text-base text-muted-foreground sm:text-lg">
            A complete toolkit for motion designers and creative developers. From vector
            shapes to GPU shaders, all driven by code.
          </p>
        </div>

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
  )
}
