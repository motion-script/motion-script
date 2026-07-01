'use client'

import SceneCanvas, { easings, ramp, lerp, type DrawFn } from './SceneCanvas'

const BLUE = '#4f80ff'
const PINK = '#e84393'
const PANEL = '#1e293b'

const drawScene: DrawFn = (ctx, _t, h) => {
  h.rect(ctx, { cx: 0, cy: 0, w: 200, h: 200, fill: BLUE, radius: 16 })
}

export function FirstSceneCanvas() {
  return <SceneCanvas draw={drawScene} loop={3} caption="A 200×200 blue square, centered." />
}

const drawAnimating: DrawFn = (ctx, t, h) => {
  const x = t < 1.5
    ? ramp(t, 0, 1, 0, 400, easings.easeOutBack)
    : ramp(t, 1.5, 2.5, 400, 0, easings.easeOutBack)
  const rot = t < 1.5
    ? ramp(t, 0, 1, 0, 180, easings.easeOutBack)
    : ramp(t, 1.5, 2.5, 180, 360, easings.easeOutBack)

  ctx.save()
  ctx.translate(x, 0)
  ctx.rotate((rot * Math.PI) / 180)
  h.rect(ctx, { cx: 0, cy: 0, w: 200, h: 200, fill: BLUE, radius: 16 })
  ctx.restore()
}

export function AnimatingCanvas() {
  return <SceneCanvas draw={drawAnimating} loop={3} caption="Slide and spin with .to() and easeOutBack." />
}

const drawText: DrawFn = (ctx, t, h) => {
  const opacity = ramp(t, 0.3, 1.1, 0, 1, easings.easeOut)
  const y = ramp(t, 0.3, 1.1, -20, 0, easings.easeOut)
  h.text(ctx, { cx: 0, cy: y, text: 'Motion Script', size: 110, weight: 800, fill: '#ffffff', opacity })
}

export function TextCanvas() {
  return <SceneCanvas draw={drawText} loop={3} caption="A Text title fading and drifting into place." />
}

const drawLayout: DrawFn = (ctx, t, h) => {
  const PAD = 44
  const SQUARE = 110
  const TITLE_H = 56
  const TITLE_FONT = 52
  const gap = ramp(t, 0.4, 1.4, 22, 90, easings.easeOut)

  const contentH = SQUARE + gap + TITLE_H
  const cardH = contentH + PAD * 2
  const cardW = 520

  h.rect(ctx, { cx: 0, cy: 0, w: cardW, h: cardH, fill: PANEL, radius: 22 })

  const topY = contentH / 2
  const squareCy = topY - SQUARE / 2
  const titleCy = topY - SQUARE - gap - TITLE_H / 2

  h.rect(ctx, { cx: 0, cy: squareCy, w: SQUARE, h: SQUARE, fill: BLUE, radius: 16 })
  h.text(ctx, { cx: 0, cy: titleCy, text: 'Motion Script', size: TITLE_FONT, weight: 700, fill: '#ffffff' })
}

export function LayoutCanvas() {
  return <SceneCanvas draw={drawLayout} loop={3} caption="A column layout whose gap animates open." />
}

const drawEffects: DrawFn = (ctx, t, h) => {
  const PAD = 44
  const SQUARE = 110
  const GAP = 28
  const TITLE_H = 56
  const contentH = SQUARE + GAP + TITLE_H
  const cardH = contentH + PAD * 2
  const cardW = 520

  const blur = t < 2.2
    ? ramp(t, 0.2, 1.2, 20, 0, easings.easeOut)
    : ramp(t, 2.2, 3.0, 0, 20, easings.easeOut)

  ctx.save()
  ;(ctx as unknown as Record<string, unknown>).filter = `blur(${blur}px)`

  h.rect(ctx, { cx: 0, cy: 0, w: cardW, h: cardH, fill: PANEL, radius: 22 })
  const topY = contentH / 2
  h.rect(ctx, { cx: 0, cy: topY - SQUARE / 2, w: SQUARE, h: SQUARE, fill: BLUE, radius: 16 })
  h.text(ctx, { cx: 0, cy: topY - SQUARE - GAP - TITLE_H / 2, text: 'Motion Script', size: 52, weight: 700, fill: '#ffffff' })

  ;(ctx as unknown as Record<string, unknown>).filter = 'none'
  ctx.restore()
}

export function EffectsCanvas() {
  return <SceneCanvas draw={drawEffects} loop={3} caption="A focus pull: the card resolves from blur to crisp." />
}

const drawMasks: DrawFn = (ctx, t, h) => {
  const PAD = 44
  const SQUARE = 110
  const GAP = 28
  const TITLE_H = 56
  const contentH = SQUARE + GAP + TITLE_H
  const cardH = contentH + PAD * 2
  const cardW = 520

  const d = t < 2.3
    ? ramp(t, 0.2, 1.4, 0, 900, easings.easeInOut)
    : ramp(t, 2.3, 3.0, 900, 0, easings.easeInOut)

  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, 0, d / 2, d / 2, 0, 0, Math.PI * 2)
  ctx.clip()

  h.rect(ctx, { cx: 0, cy: 0, w: cardW, h: cardH, fill: PANEL, radius: 22 })
  const topY = contentH / 2
  h.rect(ctx, { cx: 0, cy: topY - SQUARE / 2, w: SQUARE, h: SQUARE, fill: BLUE, radius: 16 })
  h.text(ctx, { cx: 0, cy: topY - SQUARE - GAP - TITLE_H / 2, text: 'Motion Script', size: 52, weight: 700, fill: '#ffffff' })
  ctx.restore()
}

export function MaskCanvas() {
  return <SceneCanvas draw={drawMasks} loop={3} caption="An iris reveal: a growing circle masks the card." />
}

const drawTextMask: DrawFn = (ctx, t, h) => {
  const phase = (Math.sin((t / 3) * Math.PI * 2) + 1) / 2
  const x0 = lerp(-700, -500, phase)
  const x1 = lerp(500, 700, phase)
  const grad = h.linearGradient(ctx, x0, x1, [BLUE, PINK])
  h.text(ctx, { cx: 0, cy: 0, text: 'MOTION', size: 240, weight: 900, fill: grad, letterSpacing: 6 })
}

export function TextMaskCanvas() {
  return <SceneCanvas draw={drawTextMask} loop={3} caption="A gradient showing through the letters of a text mask." />
}
