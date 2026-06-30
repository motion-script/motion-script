'use client'

import { useMemo, useState, useEffect } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// A KaTeX-rendered equation that animates the way Motion Canvas morphs LaTeX:
// the shared part of the equation is a single persistent element that shifts to
// make room, and only the *new* term fades into the gap that opens up. There is
// no second full equation overlaid on top — `BASE` is always the same DOM, it
// just slides left, while `ADDED` fades/slides in beside it.
//
//   E^2 = (mc^2)^2   →   E^2 = (mc^2)^2 + (pc)^2
//
// Driven by the shared SceneCanvas clock.
const BASE = 'E^2 = (mc^2)^2'
const ADDED = '+ (pc)^2'

function render(tex: string) {
  // displayMode: false → KaTeX emits an inline-block `.katex` that shrink-wraps
  // to the glyphs (no full-width centered `.katex-display` block), so the two
  // pieces sit flush in the flex row with only their natural operator spacing.
  return katex.renderToString(tex, { throwOnError: false, displayMode: false })
}

// easeInOut cubic — matches the feel of the code snippet's easeInOut tween.
const easeInOut = (t: number) => {
  t = Math.max(0, Math.min(1, t))
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function LatexMorph({ t, loop, dark }: { t: number; loop: number; dark: boolean }) {
  const html = useMemo(() => ({ base: render(BASE), added: render(ADDED) }), [])

  // The animation depends on the live clock + resolved theme, which differ
  // between the server render (t=0, theme unresolved) and the first client
  // frame — gate the dynamic output behind mount to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const color = dark ? '#ffffff' : '#1b1b24'

  // How far the added term shifts the base left, and how far it travels in.
  const SHIFT = 56 // px the base slides left to open a gap on the right
  const GAP = -46 // px between base and added term (negative tucks them closer)

  // Build position across the loop: hold the base, morph in the new term, hold.
  // 0..0.25 hold base · 0.25..0.6 morph · rest hold full equation.
  const raw = mounted ? t / loop : 1
  const p = easeInOut((raw - 0.25) / 0.35) // 0 before 25%, 1 by 60%

  return (
    <div
      className="relative flex select-none items-center"
      style={{ color, fontSize: '3.2rem', lineHeight: 1 }}
    >
      {/* The shared equation — one persistent element that slides left. */}
      <div
        style={{ transform: `translateX(${-SHIFT * p}px)`, transition: 'none' }}
        dangerouslySetInnerHTML={{ __html: html.base }}
      />
      {/* The new term — fades and slides into the gap that opens on the right. */}
      <div
        style={{
          marginLeft: GAP,
          opacity: p,
          transform: `translateX(${(-SHIFT + 16) * (1 - p)}px)`,
          transition: 'none',
        }}
        dangerouslySetInnerHTML={{ __html: html.added }}
      />
    </div>
  )
}
