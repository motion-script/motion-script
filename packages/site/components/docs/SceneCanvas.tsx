'use client'

import { useEffect, useRef } from 'react'

const SCENE_W = 1920
const SCENE_H = 1080
const BG = '#0a0a0f'
export const FONT = '"DM Sans Variable", ui-sans-serif, system-ui, sans-serif'

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

interface Props {
  draw: DrawFn
  loop: number
  caption?: string
  bg?: string
  aspect?: string
}

export default function SceneCanvas({ draw, loop, caption, bg = BG, aspect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const drawRef = useRef(draw)
  drawRef.current = draw
  const bgRef = useRef(bg)
  bgRef.current = bg

  useEffect(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (document.fonts?.load) document.fonts.load(`700 80px ${FONT}`)

    let raf = 0
    let visible = true
    let start = performance.now()

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = wrapper.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
    }
    resize()

    const render = (now: number) => {
      const t = ((((now - start) / 1000) % loop) + loop) % loop
      const scale = canvas.width / SCENE_W

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = bgRef.current
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.setTransform(scale, 0, 0, -scale, canvas.width / 2, canvas.height / 2)
      ctx.globalAlpha = 1
      drawRef.current(ctx, t, helpers)

      raf = visible ? requestAnimationFrame(render) : 0
    }

    const ro = new ResizeObserver(resize)
    ro.observe(wrapper)

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !visible) {
          visible = true
          start = performance.now()
          raf = requestAnimationFrame(render)
        } else if (!entry.isIntersecting) {
          visible = false
          if (raf) cancelAnimationFrame(raf)
          raf = 0
        }
      },
      { threshold: 0.01 },
    )
    io.observe(wrapper)

    raf = requestAnimationFrame(render)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
  }, [loop])

  return (
    <figure style={{ margin: '0 0 1.5rem' }}>
      <div
        ref={wrapperRef}
        className={`w-full overflow-hidden rounded-xl${aspect ? '' : ' aspect-video'}`}
        style={{
          border: '1px solid color-mix(in srgb, currentColor 15%, transparent)',
          ...(aspect ? { aspectRatio: aspect } : null),
        }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-muted-foreground">{caption}</figcaption>
      )}
    </figure>
  )
}
