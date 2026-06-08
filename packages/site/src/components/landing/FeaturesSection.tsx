import React from 'react';
import { useInView } from './useInView';
import LayoutCanvas from './LayoutCanvas';
import NumberCanvas from './NumberCanvas';

const features = [
  {
    id: 'layout',
    badge: 'Layout',
    title: 'Flexbox Layouts',
    subtitle: 'Responsive arrangements, no manual math',
    description:
      'Lay out scenes with a familiar flexbox model. Align, distribute, and stack nodes with rows, columns, gaps, and wrapping — and watch everything reflow as your content animates.',
    bullets: [
      { title: 'Flexbox engine', text: 'Rows, columns, gaps, and alignment built in' },
      { title: 'Auto reflow', text: 'Layouts adapt as nodes resize or appear' },
      { title: 'Nestable', text: 'Compose containers for complex scenes' },
    ],
    video: '/layout.mp4',
    gradient: 'from-indigo-500 to-purple-600',
    iconGradient: 'from-indigo-500 to-purple-600',
  },
  {
    id: 'code',
    badge: 'Code',
    title: 'Animate with Code',
    subtitle: 'Your animations, written in TypeScript',
    description:
      'Describe motion the way you describe logic. Compose animations in TypeScript with full type-safety, reuse components, and let Vite hot-reload every change into a live preview.',
    bullets: [
      { title: 'Type-safe API', text: 'Component-driven animations, fully typed' },
      { title: 'Instant preview', text: 'Hot-reload on every change, powered by Vite' },
      { title: 'Git-friendly', text: 'Readable diffs you can actually review' },
    ],
    video: '/code.mp4',
    gradient: 'from-purple-500 to-pink-600',
    iconGradient: 'from-purple-500 to-pink-600',
  },
  {
    id: 'text',
    badge: 'Text',
    title: 'Text Animation',
    subtitle: 'Typography that comes alive',
    description:
      'A complete text engine built for motion. Animate variable-font weight axes, compose rich multi-span text, paint type with gradient and image fills, stroke and dash your letterforms, and let text autosize and wrap to fit any layout.',
    bullets: [
      { title: 'Variable fonts', text: 'Animate weight and other axes over time' },
      { title: 'Rich text & fills', text: 'Multi-span runs with gradient and image fills' },
      { title: 'Dashed strokes', text: 'Outline and dash any glyph' },
      { title: 'Autosize & wrap', text: 'Text reflows and fits its container automatically' },
    ],
    video: '/text.mp4',
    gradient: 'from-pink-500 to-rose-600',
    iconGradient: 'from-pink-500 to-rose-600',
  },
  {
    id: 'effects',
    badge: 'Effects',
    title: 'Custom SkSL Effects',
    subtitle: 'GPU shaders for any node',
    description:
      'Write custom shader effects in SkSL and apply them to any node. From vignettes and ripples to chromatic aberration, build GPU-accelerated visuals that animate in real time.',
    bullets: [
      { title: 'SkSL shaders', text: 'Author GPU effects in real time' },
      { title: 'Stackable', text: 'Apply and combine effects on any node' },
      { title: 'Animatable', text: 'Drive shader uniforms over time' },
    ],
    video: '/effects.mp4',
    gradient: 'from-cyan-500 to-blue-600',
    iconGradient: 'from-cyan-500 to-blue-600',
  },
];

function FeatureCard({ feature, index }: { feature: (typeof features)[0]; index: number }) {
  const [ref, isInView] = useInView<HTMLDivElement>({ once: true, margin: '-100px' });
  const isReversed = index % 2 === 1;

  return (
    <div
      ref={ref}
      style={{ '--reveal-delay': '0.1s' } as React.CSSProperties}
      className={`reveal-up${isInView ? ' is-visible' : ''} grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center`}
    >
      {/* Demo — the layout feature renders live on a canvas (no video to load);
          the rest still play their recorded clips. */}
      <div className={isReversed ? 'lg:order-2' : ''}>
        <div className="relative aspect-video rounded-xl bg-[var(--background)] border border-[var(--border)] overflow-hidden">
          {feature.id === 'layout' ? (
            <LayoutCanvas />
          ) : feature.id === 'text' ? (
            <NumberCanvas />
          ) : (
            <video
              className="absolute inset-0 h-full w-full object-cover"
              src={feature.video}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
          )}
        </div>
      </div>

      {/* Content */}
      <div className={isReversed ? 'lg:order-1' : ''}>
        <span className="inline-block mb-4 px-2.5 py-0.5 text-xs font-medium rounded-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--muted-foreground)]">
          {feature.badge}
        </span>

        <h3 className="text-4xl font-serif sm:text-3xl font-bold text-foreground mb-2">
          {feature.title}
        </h3>
        {/* <p className="text-[var(--muted-foreground)] text-sm font-medium mb-4">{feature.subtitle}</p> */}
        <p className="text-muted-foreground leading-relaxed mb-8 text-sm sm:text-base">
          {feature.description}
        </p>

        <div className="space-y-5">
          {feature.bullets.map((bullet, i) => (
            <div
              key={i}
              style={{ '--reveal-delay': `${0.3 + i * 0.1}s` } as React.CSSProperties}
              className={`reveal-left${isInView ? ' is-visible' : ''} flex items-start gap-3.5`}
            >
              <div className="relative mt-0.5 shrink-0 w-6 h-6 rounded-full flex items-center justify-center ring-1 ring-inset ring-(--foreground)/5 overflow-hidden">
                <span
                  className={`absolute inset-0 bg-linear-to-br ${feature.iconGradient} opacity-20`}
                  aria-hidden
                />
                <svg
                  className="relative w-3 h-3 text-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="min-w-0">
                <span className="text-sm sm:text-base font-semibold text-[var(--foreground)]">
                  {bullet.title}
                </span>
                <span className="text-sm sm:text-base text-[var(--muted-foreground)]">
                  {' — '}
                  {bullet.text}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FeaturesSection() {
  const [ref, isInView] = useInView<HTMLDivElement>({ once: true, margin: '-100px' });

  return (
    <section id="features" className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div
          ref={ref}
          className={`reveal-up${isInView ? ' is-visible' : ''} text-center mb-20`}
        >
          <span className="inline-block mb-4 px-2.5 py-0.5 text-xs font-medium rounded-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--muted-foreground)]">
            Features
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-[var(--foreground)] mb-4">
            Everything you need to{' '}
            <span className="bg-gradient-to-r from-indigo-500 to-blue-400 bg-clip-text text-transparent  font-code">
              CREATE
            </span>
          </h2>
          <p className="text-[var(--muted-foreground)]  mx-auto text-base sm:text-lg">
            A complete toolkit for motion designers and creative developers. From vector shapes to
            3D scenes, all driven by code.
          </p>
        </div>

        <div className="space-y-24 sm:space-y-32">
          {features.map((feature, index) => (
            <FeatureCard key={feature.id} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
