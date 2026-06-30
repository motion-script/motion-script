'use client'

import SceneCanvas, { easings, ramp, lerp, FONT, type DrawFn } from './SceneCanvas'

const BLUE = '#6990DD'
const PINK = '#E8617C'
const GOLD = '#F5C26B'
const BG = '#0a090e'
const PALETTE = [BLUE, PINK, GOLD]

function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const TAU = Math.PI * 2
const rad = (deg: number) => (deg * Math.PI) / 180

function NodeCanvas({ draw, loop = 4 }: { draw: DrawFn; loop?: number }) {
  return <SceneCanvas draw={draw} loop={loop} bg={BG} aspect="5 / 2" />
}

function pingPong(t: number, loop: number, lead: number, from: number, to: number, ease = easings.easeInOut) {
  const half = loop / 2
  return t < half
    ? ramp(t, lead, half - lead, from, to, ease)
    : ramp(t, half + lead, loop - lead, to, from, ease)
}

function polygonPoints(sides: number, rx: number, ry: number, rotation = -90): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  for (let i = 0; i < sides; i++) {
    const a = rad(rotation) + (i / sides) * TAU
    pts.push([Math.cos(a) * rx, Math.sin(a) * ry])
  }
  return pts
}

function starPoints(sides: number, ratio: number, rx: number, ry: number, rotation = -90): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  for (let i = 0; i < sides * 2; i++) {
    const r = i % 2 === 0 ? 1 : ratio
    const a = rad(rotation) + (i / (sides * 2)) * TAU
    pts.push([Math.cos(a) * rx * r, Math.sin(a) * ry * r])
  }
  return pts
}

function tracePolygon(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>) {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.closePath()
}

const FULL = 'Motion Script'
const drawText: DrawFn = (ctx, t, h) => {
  const chars = Math.round(ramp(t, 0.2, 2.0, 0, FULL.length, easings.linear))
  h.text(ctx, { cx: 0, cy: 0, text: FULL.slice(0, chars), size: 130, weight: 800, fill: '#ffffff' })
}
export function TextCanvas() {
  return <NodeCanvas draw={drawText} />
}

const drawRichText: DrawFn = (ctx, t, h) => {
  const size = 130
  ctx.save()
  ctx.scale(1, -1)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  const mix = pingPong(t, 4, 0.2, 0, 1)
  const blend = (a: string, b: string, m: number) => {
    const pa = parseInt(a.slice(1), 16)
    const pb = parseInt(b.slice(1), 16)
    const ch = (s: number) => {
      const r = lerp((pa >> s) & 0xff, (pb >> s) & 0xff, m)
      return Math.round(r)
    }
    return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`
  }
  const parts = [
    { text: 'Motion ', weight: 400, fill: '#ffffff' },
    { text: 'Script', weight: 800, fill: blend(BLUE, PINK, mix) },
  ]
  let total = 0
  for (const p of parts) {
    ctx.font = `${p.weight} ${size}px ${FONT}`
    total += ctx.measureText(p.text).width
  }
  let x = -total / 2
  for (const p of parts) {
    ctx.font = `${p.weight} ${size}px ${FONT}`
    ctx.fillStyle = p.fill
    ctx.fillText(p.text, x, 0)
    x += ctx.measureText(p.text).width
  }
  ctx.restore()
}
export function RichTextCanvas() {
  return <NodeCanvas draw={drawRichText} />
}

const drawRect: DrawFn = (ctx, t, h) => {
  const S = 130
  const gap = ramp(t, 0.2, 1.2, 30, 100, easings.easeOut)
  const colT = ramp(t, 1.8, 2.8, 0, 1, easings.easeInOut)
  const PAD = 44

  const span = S * 3 + gap * 2
  ctx.save()
  PALETTE.forEach((fill, i) => {
    const rowX = -span / 2 + S / 2 + i * (S + gap)
    const colX = 0
    const colY = span / 2 - S / 2 - i * (S + gap)
    const x = lerp(rowX, colX, colT)
    const y = lerp(0, colY, colT)
    h.rect(ctx, { cx: x, cy: y, w: S, h: S, fill, radius: 14 })
  })
  const boxW = lerp(span + PAD * 2, S + PAD * 2, colT)
  const boxH = lerp(S + PAD * 2, span + PAD * 2, colT)
  h.rect(ctx, { cx: 0, cy: 0, w: boxW, h: boxH, fill: 'transparent', radius: 24, stroke: tint(BLUE, 0.4), strokeWidth: 3 })
  ctx.restore()
}
export function RectCanvas() {
  return <NodeCanvas draw={drawRect} />
}

const drawEllipse: DrawFn = (ctx, t, h) => {
  void h
  const R = 180
  const sweep = pingPong(t, 4, 0.2, 0, 360, easings.easeInOut)
  ctx.beginPath()
  ctx.ellipse(0, 0, R, R, 0, 0, TAU)
  ctx.lineWidth = 24
  ctx.strokeStyle = tint(BLUE, 0.18)
  ctx.stroke()
  if (sweep > 0.01) {
    ctx.beginPath()
    ctx.ellipse(0, 0, R, R, 0, rad(90), rad(90) - rad(sweep), true)
    ctx.lineWidth = 24
    ctx.lineCap = 'round'
    ctx.strokeStyle = BLUE
    ctx.stroke()
  }
}
export function EllipseCanvas() {
  return <NodeCanvas draw={drawEllipse} />
}

function polygonBoundary(sides: number, rx: number, ry: number, samples: number, rotation = -90) {
  const verts = polygonPoints(sides, rx, ry, rotation)
  const out: Array<[number, number]> = []
  for (let i = 0; i < samples; i++) {
    const u = (i / samples) * sides
    const e = Math.floor(u) % sides
    const f = u - Math.floor(u)
    const [ax, ay] = verts[e]
    const [bx, by] = verts[(e + 1) % sides]
    out.push([lerp(ax, bx, f), lerp(ay, by, f)])
  }
  return out
}
const drawPolygon: DrawFn = (ctx, t, h) => {
  void h
  const R = 185
  const SAMPLES = 240
  const sidesF = pingPong(t, 4, 0.3, 3, 6, easings.easeInOut)
  const lo = Math.max(3, Math.floor(sidesF))
  const hi = lo + 1
  const f = sidesF - lo
  const a = polygonBoundary(lo, R, R, SAMPLES)
  const b = polygonBoundary(hi, R, R, SAMPLES)
  ctx.beginPath()
  for (let i = 0; i < SAMPLES; i++) {
    const x = lerp(a[i][0], b[i][0], f)
    const y = lerp(a[i][1], b[i][1], f)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = BLUE
  ctx.fill()
}
export function PolygonCanvas() {
  return <NodeCanvas draw={drawPolygon} />
}

const drawPolygram: DrawFn = (ctx, t, h) => {
  void h
  const R = 200
  const sides = 5
  const ratio = pingPong(t, 4, 0.3, 0.4, 0.85, easings.easeInOut)
  tracePolygon(ctx, starPoints(sides, ratio, R, R))
  ctx.fillStyle = GOLD
  ctx.fill()
}
export function PolygramCanvas() {
  return <NodeCanvas draw={drawPolygram} />
}

const drawLineGrid: DrawFn = (ctx, t, h) => {
  void h
  const W = 760
  const H = 380
  const divF = pingPong(t, 4, 0.3, 1, 8, easings.easeInOut)
  const div = Math.max(1, Math.round(divF))
  ctx.lineWidth = 2
  ctx.strokeStyle = tint(BLUE, 0.55)
  ctx.beginPath()
  for (let i = 0; i <= div; i++) {
    const x = -W / 2 + (i / div) * W
    ctx.moveTo(x, -H / 2)
    ctx.lineTo(x, H / 2)
  }
  for (let j = 0; j <= div; j++) {
    const y = -H / 2 + (j / div) * H
    ctx.moveTo(-W / 2, y)
    ctx.lineTo(W / 2, y)
  }
  ctx.stroke()
}
export function LineGridCanvas() {
  return <NodeCanvas draw={drawLineGrid} />
}

const drawCamera: DrawFn = (ctx, t, h) => {
  const VW = 760
  const VH = 380
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(-VW / 2, -VH / 2, VW, VH, 18)
  ctx.fillStyle = tint(BLUE, 0.06)
  ctx.fill()
  ctx.save()
  ctx.clip()

  const panX = t < 2.5
    ? ramp(t, 0.2, 1.5, 0, 240, easings.easeInOut)
    : ramp(t, 2.5, 3.9, 240, 0, easings.easeInOut)
  const zoom = t < 2.5
    ? ramp(t, 1.4, 2.4, 1, 1.8, easings.easeInOut)
    : ramp(t, 2.5, 3.9, 1.8, 1, easings.easeInOut)
  ctx.scale(zoom, zoom)
  ctx.translate(-panX, 0)

  const boxes: Array<[number, string]> = [[-240, BLUE], [0, PINK], [240, GOLD]]
  boxes.forEach(([x, fill]) => h.rect(ctx, { cx: x, cy: 0, w: 130, h: 130, fill, radius: 12 }))

  ctx.restore()
  ctx.beginPath()
  ctx.roundRect(-VW / 2, -VH / 2, VW, VH, 18)
  ctx.lineWidth = 3
  ctx.strokeStyle = tint(BLUE, 0.4)
  ctx.stroke()
  ctx.restore()
}
export function CameraCanvas() {
  return <NodeCanvas draw={drawCamera} />
}

const drawRow: DrawFn = (ctx, t, h) => {
  const S = 140
  const gap = pingPong(t, 4, 0.3, 24, 170, easings.easeInOut)
  const span = S * 3 + gap * 2
  PALETTE.forEach((fill, i) => {
    const x = -span / 2 + S / 2 + i * (S + gap)
    h.rect(ctx, { cx: x, cy: 0, w: S, h: S, fill, radius: 12 })
  })
}
export function RowCanvas() {
  return <NodeCanvas draw={drawRow} />
}

const drawColumn: DrawFn = (ctx, t, h) => {
  const W = 380
  const Hb = 90
  const gap = pingPong(t, 4, 0.3, 16, 90, easings.easeInOut)
  const span = Hb * 3 + gap * 2
  PALETTE.forEach((fill, i) => {
    const y = span / 2 - Hb / 2 - i * (Hb + gap)
    h.rect(ctx, { cx: 0, cy: y, w: W, h: Hb, fill, radius: 12 })
  })
}
export function ColumnCanvas() {
  return <NodeCanvas draw={drawColumn} />
}

const drawGrid: DrawFn = (ctx, t, h) => {
  const N = 8
  const gap = 20
  const colsF = pingPong(t, 4, 0.4, 4, 2, easings.easeInOut)
  const cols = colsF > 3 ? 4 : 2
  const rows = Math.ceil(N / cols)
  const fieldW = 760
  const cellW = (fieldW - gap * (cols - 1)) / cols
  const cellH = cols === 4 ? 130 : 80
  const fieldH = cellH * rows + gap * (rows - 1)

  const PAD = 32
  h.rect(ctx, { cx: 0, cy: 0, w: fieldW + PAD * 2, h: fieldH + PAD * 2, fill: tint(BLUE, 0.06), radius: 18 })

  for (let i = 0; i < N; i++) {
    const r = Math.floor(i / cols)
    const c = i % cols
    const x = -fieldW / 2 + cellW / 2 + c * (cellW + gap)
    const y = fieldH / 2 - cellH / 2 - r * (cellH + gap)
    h.rect(ctx, { cx: x, cy: y, w: cellW, h: cellH, fill: PALETTE[i % 3], radius: 8 })
  }
}
export function GridCanvas() {
  return <NodeCanvas draw={drawGrid} />
}

const drawImage: DrawFn = (ctx, t, h) => {
  void h
  const W = 760
  const Hf = 380
  const opacity = ramp(t, 0.2, 1.0, 0, 1, easings.easeOut)
  const radius = pingPong(t, 4, 0.2, 0, 56, easings.easeInOut)

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.beginPath()
  ctx.roundRect(-W / 2, -Hf / 2, W, Hf, radius)
  ctx.clip()
  const g = ctx.createLinearGradient(-W / 2, Hf / 2, W / 2, -Hf / 2)
  g.addColorStop(0, BLUE)
  g.addColorStop(0.55, PINK)
  g.addColorStop(1, GOLD)
  ctx.fillStyle = g
  ctx.fillRect(-W / 2, -Hf / 2, W, Hf)
  ctx.beginPath()
  ctx.ellipse(W * 0.22, Hf * 0.14, 56, 56, 0, 0, TAU)
  ctx.fillStyle = tint(GOLD, 0.95)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-W / 2, -Hf / 2)
  ctx.quadraticCurveTo(-W * 0.1, -Hf * 0.05, W / 2, -Hf * 0.28)
  ctx.lineTo(W / 2, -Hf / 2)
  ctx.closePath()
  ctx.fillStyle = tint(BLUE, 0.5)
  ctx.fill()
  ctx.restore()
}
export function ImageCanvas() {
  return <NodeCanvas draw={drawImage} />
}

const drawVideo: DrawFn = (ctx, t, h) => {
  void h
  const W = 760
  const Hf = 380
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(-W / 2, -Hf / 2, W, Hf, 16)
  ctx.clip()

  const phase = (t / 4) * TAU
  const shift = (Math.sin(phase) + 1) / 2
  const g = ctx.createLinearGradient(-W / 2, 0, W / 2, 0)
  g.addColorStop(0, BLUE)
  g.addColorStop(lerp(0.4, 0.6, shift), PINK)
  g.addColorStop(1, GOLD)
  ctx.fillStyle = g
  ctx.fillRect(-W / 2, -Hf / 2, W, Hf)

  ctx.globalAlpha = 0.1
  ctx.fillStyle = GOLD
  for (let i = -6; i <= 6; i++) {
    const x = (((i * 150 + Math.sin(phase) * 150) % (W + 300)) + (W + 300)) % (W + 300) - (W / 2 + 150)
    ctx.fillRect(x, -Hf / 2, 50, Hf)
  }
  ctx.globalAlpha = 1

  const pulse = 0.5 + 0.5 * Math.sin(phase * 2)
  ctx.globalAlpha = 0.5 + 0.3 * pulse
  ctx.beginPath()
  ctx.ellipse(0, 0, 72, 72, 0, 0, TAU)
  ctx.fillStyle = tint(BLUE, 0.55)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.scale(1, -1)
  ctx.moveTo(-22, 28)
  ctx.lineTo(-22, -28)
  ctx.lineTo(32, 0)
  ctx.closePath()
  ctx.fillStyle = GOLD
  ctx.fill()
  ctx.restore()
}
export function VideoCanvas() {
  return <NodeCanvas draw={drawVideo} />
}

const BLOB: Array<[number, number]> = (() => {
  const pts: Array<[number, number]> = []
  const n = 120
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    const r = 180 + 48 * Math.sin(a * 3) + 24 * Math.cos(a * 2)
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return pts
})()
const drawPath: DrawFn = (ctx, t, h) => {
  void h
  const end = pingPong(t, 4, 0.2, 0, 1, easings.easeInOut)
  const count = Math.max(2, Math.round(end * BLOB.length))
  ctx.beginPath()
  for (let i = 0; i < count; i++) {
    const [x, y] = BLOB[i]
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  if (end >= 0.999) ctx.closePath()
  ctx.lineWidth = 8
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = BLUE
  ctx.stroke()
}
export function PathCanvas() {
  return <NodeCanvas draw={drawPath} />
}
