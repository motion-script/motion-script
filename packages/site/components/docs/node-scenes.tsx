'use client'

import SceneCanvas, { easings, ramp, lerp, FONT, type DrawFn, type RenderFn } from './SceneCanvas'
import { LatexMorph } from './LatexMorph'

const BLUE = '#6990DD'
const PINK = '#E8617C'
const GOLD = '#F5C26B'
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

function NodeCanvas({
  draw,
  render,
  loop = 4,
  code,
  aspect = '5 / 2',
}: {
  draw?: DrawFn
  render?: RenderFn
  loop?: number
  code?: string
  aspect?: string
}) {
  return <SceneCanvas draw={draw} render={render} loop={loop} aspect={aspect} code={code} />
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
  h.text(ctx, { cx: 0, cy: 0, text: FULL.slice(0, chars), size: 130, weight: 800, fill: BLUE })
}
const textCode = `import { createScene, Text } from '@motion-script/core';

export default createScene(function* (stage) {
  stage.add(
    <Text
      text="Motion Script"
      fontSize={130}
      fontWeight={800}
      fill="white"
    />
  );
});`
export function TextCanvas() {
  return <NodeCanvas draw={drawText} code={textCode} />
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
    { text: 'Motion ', weight: 400, fill: BLUE },
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
const richTextCode = `import { createScene, RichText } from '@motion-script/core';

export default createScene(function* (stage) {
  stage.add(
    <RichText
      fontSize={130}
      fill="white"
      spans={[
        { text: 'Motion ' },
        { text: 'Script', fill: '#6990DD', fontWeight: 800 },
      ]}
    />
  );
});`
export function RichTextCanvas() {
  return <NodeCanvas draw={drawRichText} code={richTextCode} />
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
const rectCode = `import { createScene, Rect, createRef, easeOut } from '@motion-script/core';

export default createScene(function* (stage) {
  const box = createRef<Rect>();

  stage.add(
    <Rect ref={box} flow="horizontal" gap={30} padding={44} cornerRadius={24}
      stroke={{ fill: 'rgba(105, 144, 221, 0.4)', weight: 3 }}>
      <Rect width={130} height={130} fill="#6990DD" cornerRadius={14} />
      <Rect width={130} height={130} fill="#E8617C" cornerRadius={14} />
      <Rect width={130} height={130} fill="#F5C26B" cornerRadius={14} />
    </Rect>
  );

  yield* box().to({ gap: 100 }, 0.6, easeOut);
  yield* box().to({ flow: 'vertical' }, 0.8, easeOut);
});`
export function RectCanvas() {
  return <NodeCanvas draw={drawRect} code={rectCode} />
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
const ellipseCode = `import { createScene, Ellipse, createRef, easeInOut } from '@motion-script/core';

export default createScene(function* (stage) {
  const ring = createRef<Ellipse>();

  stage.add(
    <Ellipse
      ref={ring}
      width={360}
      height={360}
      startAngle={90}
      sweep={0}
      stroke={{ fill: '#6990DD', weight: 24, cap: 'round' }}
    />
  );

  // Sweep the arc open, then closed
  yield* ring().to({ sweep: 360 }, 1.6, easeInOut);
  yield* ring().to({ sweep: 0 }, 1.6, easeInOut);
});`
export function EllipseCanvas() {
  return <NodeCanvas draw={drawEllipse} code={ellipseCode} />
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
const polygonCode = `import { createScene, Polygon, createRef, easeInOut } from '@motion-script/core';

export default createScene(function* (stage) {
  const poly = createRef<Polygon>();

  stage.add(
    <Polygon ref={poly} sides={3} width={370} height={370} fill="#6990DD" />
  );

  // Morph between vertex counts
  yield* poly().to({ sides: 6 }, 1.4, easeInOut);
  yield* poly().to({ sides: 3 }, 1.4, easeInOut);
});`
export function PolygonCanvas() {
  return <NodeCanvas draw={drawPolygon} code={polygonCode} />
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
const polygramCode = `import { createScene, Polygram, createRef, easeInOut } from '@motion-script/core';

export default createScene(function* (stage) {
  const star = createRef<Polygram>();

  stage.add(
    <Polygram ref={star} sides={5} ratio={0.4} width={400} height={400} fill="#F5C26B" />
  );

  // Pulse the inner radius ratio
  yield* star().to({ ratio: 0.85 }, 1.4, easeInOut);
  yield* star().to({ ratio: 0.4 }, 1.4, easeInOut);
});`
export function PolygramCanvas() {
  return <NodeCanvas draw={drawPolygram} code={polygramCode} />
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
const lineGridCode = `import { createScene, LineGrid, createRef, easeInOut } from '@motion-script/core';

export default createScene(function* (stage) {
  const grid = createRef<LineGrid>();

  stage.add(
    <LineGrid
      ref={grid}
      width={760}
      height={380}
      divisions={1}
      stroke={{ fill: 'rgba(105, 144, 221, 0.55)', weight: 2 }}
    />
  );

  // Animate the number of divisions
  yield* grid().to({ divisions: 8 }, 1.4, easeInOut);
  yield* grid().to({ divisions: 1 }, 1.4, easeInOut);
});`
export function LineGridCanvas() {
  return <NodeCanvas draw={drawLineGrid} code={lineGridCode} />
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
const cameraCode = `import { createScene, Camera, Rect, createRef, easeInOut } from '@motion-script/core';

export default createScene(function* (stage) {
  const cam = createRef<Camera>();

  stage.add(
    <Camera ref={cam} width={760} height={380} zoom={1} lookAt={{ x: 0, y: 0 }}
      fill="rgba(105, 144, 221, 0.06)" cornerRadius={18}>
      <Rect width={130} height={130} fill="#6990DD" cornerRadius={12} x={-240} />
      <Rect width={130} height={130} fill="#E8617C" cornerRadius={12} />
      <Rect width={130} height={130} fill="#F5C26B" cornerRadius={12} x={240} />
    </Camera>
  );

  // Pan across, then zoom into the last box
  yield* cam().to({ lookAt: { x: 240, y: 0 } }, 1.3, easeInOut);
  yield* cam().to({ zoom: 1.8 }, 1.0, easeInOut);
  yield* cam().to({ zoom: 1, lookAt: { x: 0, y: 0 } }, 1.4, easeInOut);
});`
export function CameraCanvas() {
  return <NodeCanvas draw={drawCamera} code={cameraCode} />
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
const rowCode = `import { createScene, Row, Rect, createRef, easeInOut } from '@motion-script/core';

export default createScene(function* (stage) {
  const row = createRef<Row>();

  stage.add(
    <Row ref={row} gap={24} padding={16}>
      <Rect width={140} height={140} fill="#6990DD" cornerRadius={12} />
      <Rect width={140} height={140} fill="#E8617C" cornerRadius={12} />
      <Rect width={140} height={140} fill="#F5C26B" cornerRadius={12} />
    </Row>
  );

  // Expand and collapse the gap
  yield* row().to({ gap: 170 }, 1.4, easeInOut);
  yield* row().to({ gap: 24 }, 1.4, easeInOut);
});`
export function RowCanvas() {
  return <NodeCanvas draw={drawRow} code={rowCode} />
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
const columnCode = `import { createScene, Column, Rect, createRef, easeInOut } from '@motion-script/core';

export default createScene(function* (stage) {
  const col = createRef<Column>();

  stage.add(
    <Column ref={col} gap={16} padding={24}>
      <Rect width={380} height={90} fill="#6990DD" cornerRadius={12} />
      <Rect width={380} height={90} fill="#E8617C" cornerRadius={12} />
      <Rect width={380} height={90} fill="#F5C26B" cornerRadius={12} />
    </Column>
  );

  // Expand and collapse the gap
  yield* col().to({ gap: 90 }, 1.4, easeInOut);
  yield* col().to({ gap: 16 }, 1.4, easeInOut);
});`
export function ColumnCanvas() {
  return <NodeCanvas draw={drawColumn} code={columnCode} />
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
const gridCode = `import { createScene, Grid, Rect, createRef, easeInOut } from '@motion-script/core';

const PALETTE = ['#6990DD', '#E8617C', '#F5C26B'];

export default createScene(function* (stage) {
  const grid = createRef<Grid>();

  stage.add(
    <Grid ref={grid} columns={4} gap={20} padding={32}
      fill="rgba(105, 144, 221, 0.06)" cornerRadius={18}>
      {Array.from({ length: 8 }, (_, i) => (
        <Rect width="fill" height={130} cornerRadius={8} fill={PALETTE[i % 3]} />
      ))}
    </Grid>
  );

  // Reflow between column counts
  yield* grid().to({ columns: 2 }, 1.2, easeInOut);
  yield* grid().to({ columns: 4 }, 1.2, easeInOut);
});`
export function GridCanvas() {
  return <NodeCanvas draw={drawGrid} code={gridCode} />
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
const imageCode = `import { createScene, Image, createRef, easeOut, easeInOut } from '@motion-script/core';

export default createScene(function* (stage) {
  const photo = createRef<Image>();

  stage.add(
    <Image
      ref={photo}
      src="./assets/photo.jpg"
      fit="fill"
      width={760}
      height={380}
      cornerRadius={0}
      opacity={0}
    />
  );

  // Fade in, then pulse the corner radius
  yield* photo().to({ opacity: 1 }, 0.8, easeOut);
  yield* photo().to({ cornerRadius: 56 }, 1.4, easeInOut);
  yield* photo().to({ cornerRadius: 0 }, 1.4, easeInOut);
});`
export function ImageCanvas() {
  return <NodeCanvas draw={drawImage} code={imageCode} />
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
const videoCode = `import { createScene, Video, wait } from '@motion-script/core';

export default createScene(function* (stage) {
  stage.add(
    <Video
      src="./assets/clip.mp4"
      fit="fill"
      width={760}
      height={380}
      cornerRadius={16}
    />
  );

  // Play through the clip
  yield* wait(4);
});`
export function VideoCanvas() {
  return <NodeCanvas draw={drawVideo} code={videoCode} />
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
const pathCode = `import { createScene, Path, createRef, easeInOut } from '@motion-script/core';

export default createScene(function* (stage) {
  const blob = createRef<Path>();

  stage.add(
    <Path
      ref={blob}
      data="M 180 0 C 180 99 99 180 0 180 C -99 180 -180 99 -180 0 ..."
      end={0}
      stroke={{ fill: '#6990DD', weight: 8, cap: 'round', join: 'round' }}
    />
  );

  // Trim-draw the outline on, then off (start/end run 0..1)
  yield* blob().to({ end: 1 }, 1.6, easeInOut);
  yield* blob().to({ end: 0 }, 1.6, easeInOut);
});`
export function PathCanvas() {
  return <NodeCanvas draw={drawPath} code={pathCode} />
}

// --- Latex (optional @motion-script/latex package) ---------------------------
// Real KaTeX-rendered math (DOM, not canvas) that builds term-by-term so the
// equation appears to assemble/morph into place. See LatexMorph.
const latexRender: RenderFn = ({ t, loop, dark }) => <LatexMorph t={t} loop={loop} dark={dark} />
const latexCode = `import { createScene, Latex, createRef, easeInOut } from '@motion-script/latex';

export default createScene(function* (stage) {
  const eq = createRef<Latex>();

  // Start with the rest-energy relation, then morph in the momentum term
  stage.add(<Latex ref={eq} latex="E^2 = (mc^2)^2" fontSize={120} fill="white" />);

  yield* eq().to({ latex: 'E^2 = (mc^2)^2 + (pc)^2' }, 0.6, easeInOut);
});`
export function LatexCanvas() {
  return <NodeCanvas render={latexRender} loop={4} code={latexCode} />
}

// --- Code (optional @motion-script/code package) -----------------------------
// A self-contained editor demo: a rounded editor window with traffic-light dots
// and line-numbered, syntax-colored TypeScript that simply focuses line 2 then
// clears the focus, on a loop. Focus is conveyed by fading the non-focused code.
// Unlike the other node demos this paints in a top-left, y-down space (the
// editor reads naturally that way), so it overrides SceneCanvas's centered /
// y-flipped transform — but it draws the window *inset* and does not fill the
// background, so the card's theme backdrop frames it like every other demo.
const CODE_LOOP = 3.2
const CODE_W = 1180 // editor window width in the local draw space
const CODE_COLORS = {
  win: '#0f121a',
  titlebar: '#2b2f3a',
  red: '#ff5252',
  yellow: '#ffd70a',
  green: '#29ec71',
  gutter: '#5c6370',
  keyword: '#569cd6',
  fn: '#dcdcaa',
  type: '#4ec9b0',
  ident: '#9cdcfe',
  prop: '#9cdcfe',
  punct: '#d4d4d4',
}
const MONO = '"DM Mono", ui-monospace, SFMono-Regular, Menlo, monospace'

const {
  keyword: CK,
  fn: CFN,
  type: CTY,
  ident: CID,
  punct: CPU,
  prop: CPR,
} = CODE_COLORS
const CODE_LINES: Array<Array<{ text: string; color: string }>> = [
  [
    { text: 'function ', color: CK },
    { text: 'getUser', color: CFN },
    { text: '(', color: CPU },
    { text: 'id', color: CID },
    { text: ': ', color: CPU },
    { text: 'number', color: CTY },
    { text: ') {', color: CPU },
  ],
  [
    { text: '  const ', color: CK },
    { text: 'user', color: CID },
    { text: ' = ', color: CPU },
    { text: 'db', color: CID },
    { text: '.', color: CPU },
    { text: 'find', color: CFN },
    { text: '(', color: CPU },
    { text: 'id', color: CID },
    { text: ');', color: CPU },
  ],
  [
    { text: '  return ', color: CK },
    { text: 'user', color: CID },
    { text: '.', color: CPU },
    { text: 'name', color: CPR },
    { text: ';', color: CPU },
  ],
  [{ text: '}', color: CPU }],
]
const FOCUS_LINE = 1 // line 2 (0-indexed) — the one we select / deselect

// Highlight intensity 0→1 over the loop: fade in (select), hold, fade out
// (deselect), then rest. Mirrors highlight(lines(2)) → resetHighlight().
const codeFocus = (t: number) => pingPong(t, CODE_LOOP, 0.4, 0, 1, easings.easeInOut)

const drawCode: DrawFn = (ctx, t) => {
  const cw = ctx.canvas.width
  const ch = ctx.canvas.height
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  // Scale the local draw space (a ~16:9 frame around the editor) into the
  // canvas, contain-fit and centered. Drawing a frame larger than the window
  // leaves a comfortable margin so the card's theme background shows around it.
  const FRAME_W = CODE_W + 240
  const FRAME_H = FRAME_W * (9 / 16)
  const s = Math.min(cw / FRAME_W, ch / FRAME_H)
  ctx.setTransform(s, 0, 0, s, cw / 2, ch / 2)

  const fontSize = 40
  const lineH = fontSize * 1.5
  const titleH = 64
  const padX = 48
  const padY = 40
  ctx.font = `500 ${fontSize}px ${MONO}`
  ctx.textBaseline = 'top'

  const codeH = CODE_LINES.length * lineH
  const winH = titleH + padY * 2 + codeH
  const winX = -CODE_W / 2
  const winY = -winH / 2

  // Window body + title bar.
  ctx.beginPath()
  ctx.roundRect(winX, winY, CODE_W, winH, 22)
  ctx.fillStyle = CODE_COLORS.win
  ctx.fill()
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(winX, winY, CODE_W, winH, 22)
  ctx.clip()
  ctx.fillStyle = CODE_COLORS.titlebar
  ctx.fillRect(winX, winY, CODE_W, titleH)
  ctx.restore()

  // Traffic-light dots.
  const dotY = winY + titleH / 2
  ;[CODE_COLORS.red, CODE_COLORS.yellow, CODE_COLORS.green].forEach((c, i) => {
    ctx.beginPath()
    ctx.ellipse(winX + 44 + i * 38, dotY, 11, 11, 0, 0, TAU)
    ctx.fillStyle = c
    ctx.fill()
  })

  // Code area — dim every line except the focused one as the highlight rises.
  const DIM = 0.28
  const focus = codeFocus(t)
  const codeX = winX + padX
  const gutterW = ctx.measureText('0  ').width
  const textX = codeX + gutterW
  let y = winY + titleH + padY
  for (let i = 0; i < CODE_LINES.length; i++) {
    const emph = i === FOCUS_LINE ? 1 : 1 - focus * (1 - DIM)
    ctx.globalAlpha = 0.8 * emph
    ctx.fillStyle = CODE_COLORS.gutter
    ctx.fillText(String(i + 1), codeX, y)

    let tx = textX
    for (const tok of CODE_LINES[i]) {
      ctx.globalAlpha = emph
      ctx.fillStyle = tok.color
      ctx.fillText(tok.text, tx, y)
      tx += ctx.measureText(tok.text).width
    }
    y += lineH
  }
  ctx.globalAlpha = 1
  ctx.restore()
}
const codeCode = `import { createScene, createRef, wait } from '@motion-script/core';
import { Code, lines } from '@motion-script/code';

export default createScene(function* (stage) {
  const ref = createRef<Code>();

  stage.add(
    <Code
      ref={ref}
      code={\`function getUser(id: number) {
  const user = db.find(id);
  return user.name;
}\`}
      fontSize={32}
      showLineNumbers={true}
    />
  );

  yield* wait(0.4);
  yield* ref().highlight(lines(2), 0.6);   // select line 2
  yield* wait(0.8);
  yield* ref().resetHighlight(0.6);        // deselect
  yield* wait(0.4);
});`
export function CodeCanvas() {
  return <NodeCanvas draw={drawCode} loop={CODE_LOOP} code={codeCode} aspect="16 / 9" />
}
