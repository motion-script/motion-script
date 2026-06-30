'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { CodePanel } from './SceneCode'
import { SceneTransport } from './SceneTransport'

const SCENE_W = 1920
// Theme-aware canvas backgrounds. The accent palette (blue/pink/gold) reads on
// both, so only the backdrop swaps. Callers may still override via `bg`/`bgLight`.
// Dark bg is deliberately a soft charcoal (not near-black) so the card sits
// gently above the page rather than punching a black hole into it.
const BG_DARK = '#1b1b24'
const BG_LIGHT = '#f4f4f7'
export const FONT = '"DM Sans Variable", ui-sans-serif, system-ui, sans-serif'

const STEP = 0.1 // seconds per step-forward/back
export type SceneMode = 'animation' | 'split' | 'code'

const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const easings = {
  linear: clamp01,
  easeOut: (t: number) => 1 - Math.pow(1 - clamp01(t), 3),
  easeInOut: (t: number) => {
    t = clamp01(t)
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  },
  easeOutBack: (t: number) => {
    t = clamp01(t)
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
}

export type Easing = (t: number) => number

export function ramp(t: number, t0: number, t1: number, from: number, to: number, ease: Easing = easings.linear) {
  if (t <= t0) return from
  if (t >= t1) return to
  return lerp(from, to, ease((t - t0) / (t1 - t0)))
}

export interface Helpers {
  rect(
    c: CanvasRenderingContext2D,
    opts: {
      cx: number
      cy: number
      w: number
      h: number
      fill?: string | CanvasGradient
      radius?: number
      stroke?: string
      strokeWidth?: number
      opacity?: number
    },
  ): void
  text(
    c: CanvasRenderingContext2D,
    opts: {
      cx: number
      cy: number
      text: string
      size: number
      weight?: number
      fill?: string | CanvasGradient
      opacity?: number
      letterSpacing?: number
    },
  ): void
  ellipse(
    c: CanvasRenderingContext2D,
    opts: { cx: number; cy: number; w: number; h: number; fill?: string; opacity?: number },
  ): void
  linearGradient(c: CanvasRenderingContext2D, x0: number, x1: number, colors: string[]): CanvasGradient
}

const helpers: Helpers = {
  rect(c, { cx, cy, w, h, fill = '#ffffff', radius = 0, stroke, strokeWidth = 0, opacity = 1 }) {
    c.save()
    c.globalAlpha *= opacity
    c.beginPath()
    c.roundRect(cx - w / 2, cy - h / 2, w, h, radius)
    c.fillStyle = fill
    c.fill()
    if (stroke && strokeWidth > 0) {
      c.lineWidth = strokeWidth
      c.strokeStyle = stroke
      c.stroke()
    }
    c.restore()
  },
  text(c, { cx, cy, text, size, weight = 400, fill = '#ffffff', opacity = 1, letterSpacing = 0 }) {
    c.save()
    c.globalAlpha *= opacity
    c.translate(cx, cy)
    c.scale(1, -1)
    c.font = `${weight} ${size}px ${FONT}`
    c.fillStyle = fill
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    if (letterSpacing) (c as unknown as Record<string, unknown>).letterSpacing = `${letterSpacing}px`
    c.fillText(text, 0, 0)
    if (letterSpacing) (c as unknown as Record<string, unknown>).letterSpacing = '0px'
    c.restore()
  },
  ellipse(c, { cx, cy, w, h, fill = '#ffffff', opacity = 1 }) {
    c.save()
    c.globalAlpha *= opacity
    c.beginPath()
    c.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2)
    c.fillStyle = fill
    c.fill()
    c.restore()
  },
  linearGradient(c, x0, x1, colors) {
    const g = c.createLinearGradient(x0, 0, x1, 0)
    colors.forEach((col, i) => g.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), col))
    return g
  },
}

export type DrawFn = (ctx: CanvasRenderingContext2D, t: number, h: Helpers) => void

// A DOM-based renderer for demos that can't be drawn on a 2D canvas (e.g. KaTeX
// math). It receives the current playback time and theme and returns a React
// node laid over the demo area. Shares the same transport / clock as `draw`.
export type RenderFn = (info: { t: number; loop: number; dark: boolean }) => React.ReactNode

interface Props {
  /** Canvas painter. Omit when using `render` (a DOM demo) instead. */
  draw?: DrawFn
  /** DOM demo renderer — an alternative to `draw` for non-canvas content. */
  render?: RenderFn
  loop: number
  caption?: string
  /** Dark-mode background. Defaults to BG_DARK. */
  bg?: string
  /** Light-mode background. Defaults to BG_LIGHT. */
  bgLight?: string
  aspect?: string
  /** Motion Script snippet. When present the hover overlay can show code / split / animation views. */
  code?: string
}

// Three-way view toggle that appears in the card's top-right corner on hover.
function ViewModeOverlay({
  mode,
  onChange,
}: {
  mode: SceneMode
  onChange: (m: SceneMode) => void
}) {
  const opts: Array<{ value: SceneMode; label: string; title: string }> = [
    { value: 'animation', label: 'Demo', title: 'Animation only' },
    { value: 'split', label: 'Split', title: 'Code + animation' },
    { value: 'code', label: 'Code', title: 'Code only' },
  ]
  return (
    <div className="pointer-events-none absolute right-2 top-2 z-20 flex gap-0.5 rounded-md border border-border/70 bg-background/80 p-0.5 opacity-0 backdrop-blur-sm transition-opacity group-hover/scene:pointer-events-auto group-hover/scene:opacity-100 dark:bg-[#15151c]/90">
      {opts.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          title={o.title}
          aria-pressed={mode === o.value}
          className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
            mode === o.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function SceneCanvas({
  draw,
  render,
  loop,
  caption,
  bg = BG_DARK,
  bgLight = BG_LIGHT,
  aspect,
  code,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme !== 'light'

  const [mode, setMode] = useState<SceneMode>('animation')
  const [playing, setPlaying] = useState(true)
  const [time, setTime] = useState(0)

  // Latest draw fn, resolved background, and play state are mirrored into refs
  // so the long-lived rAF loop reads them without re-subscribing each render.
  const drawRef = useRef(draw)
  const bgRef = useRef(bg)
  const playingRef = useRef(playing)
  const timeRef = useRef(0)
  useEffect(() => {
    drawRef.current = draw
    bgRef.current = resolvedTheme === 'light' ? bgLight : bg
    playingRef.current = playing
  })

  const showCanvas = mode !== 'code'
  const showCode = code != null && mode !== 'animation'

  const seek = (t: number) => {
    const clamped = ((t % loop) + loop) % loop
    timeRef.current = clamped
    setTime(clamped)
  }

  // Single rAF loop: advances the shared clock (so DOM `render` demos animate
  // too) and paints the canvas when a `draw` painter is present.
  useEffect(() => {
    if (!showCanvas) return
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d') ?? null

    if (document.fonts?.load) document.fonts.load(`700 80px ${FONT}`)

    let raf = 0
    let onScreen = true
    let last = performance.now()

    const resize = () => {
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      const rect = wrapper.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
    }
    resize()

    const frame = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      if (playingRef.current) {
        let t = timeRef.current + dt
        t = ((t % loop) + loop) % loop
        timeRef.current = t
        setTime(t)
      }

      if (canvas && ctx && drawRef.current) {
        const scale = canvas.width / SCENE_W
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.fillStyle = bgRef.current
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.setTransform(scale, 0, 0, -scale, canvas.width / 2, canvas.height / 2)
        ctx.globalAlpha = 1
        drawRef.current(ctx, timeRef.current, helpers)
      }

      raf = onScreen ? requestAnimationFrame(frame) : 0
    }

    const ro = new ResizeObserver(resize)
    ro.observe(wrapper)

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !onScreen) {
          onScreen = true
          last = performance.now()
          raf = requestAnimationFrame(frame)
        } else if (!entry.isIntersecting) {
          onScreen = false
          if (raf) cancelAnimationFrame(raf)
          raf = 0
        }
      },
      { threshold: 0.01 },
    )
    io.observe(wrapper)

    raf = requestAnimationFrame(frame)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
    // Re-run when the demo area mounts (mode toggles it) or loop changes.
  }, [loop, showCanvas])

  return (
    <figure className="group/scene relative" style={{ margin: '0 0 1.5rem' }}>
      {/* The outer card owns the border + rounding + clipping, so the stacked
          canvas / transport / code panels read as one connected card. */}
      <div className="relative overflow-hidden rounded-xl border border-border">
        {code != null && <ViewModeOverlay mode={mode} onChange={setMode} />}

        {showCanvas && (
          <div
            ref={wrapperRef}
            className={`relative w-full overflow-hidden${aspect ? '' : ' aspect-video'}${
              render ? ' bg-[var(--demo-bg-light)] dark:bg-[var(--demo-bg)]' : ''
            }`}
            style={{
              // These vars are static (from props), so they're identical on
              // server and client — the theme choice is made by the `.dark`
              // class (set by next-themes pre-hydration), avoiding a mismatch.
              ...(aspect ? { aspectRatio: aspect } : null),
              ...(render
                ? ({ '--demo-bg': bg, '--demo-bg-light': bgLight } as React.CSSProperties)
                : null),
            }}
          >
            {render ? (
              <div className="absolute inset-0 flex items-center justify-center">
                {render({ t: time, loop, dark })}
              </div>
            ) : (
              <canvas ref={canvasRef} className="block h-full w-full" />
            )}
          </div>
        )}

        {showCanvas && (
          <SceneTransport
            playing={playing}
            time={time}
            loop={loop}
            onPlayPause={() => setPlaying((p) => !p)}
            onStepBack={() => {
              setPlaying(false)
              seek(timeRef.current - STEP)
            }}
            onStepForward={() => {
              setPlaying(false)
              seek(timeRef.current + STEP)
            }}
            onSeek={(t) => {
              setPlaying(false)
              seek(t)
            }}
          />
        )}

        {showCode && code != null && (
          <CodePanel code={code} className={showCanvas ? 'border-t border-border' : ''} />
        )}
      </div>

      {caption && (
        <figcaption className="mt-2 text-center text-sm text-muted-foreground">{caption}</figcaption>
      )}
    </figure>
  )
}
