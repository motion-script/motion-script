import React, { useEffect, useRef } from 'react';

/**
 * Canvas reproduction of the `ChromaticAberrationScene` SkSL demo.
 *
 * The real scene runs a chromatic-aberration shader on each node. That effect is
 * just three composited passes (see the engine's CanvasKit implementation):
 *   1. the full-colour source,
 *   2. a red-only ghost shifted by (+dx, +dy), Screen-blended on top,
 *   3. a blue-only ghost shifted by (-dx, -dy), Screen-blended on top,
 * with dx = cos(angle)·amount, dy = sin(angle)·amount.
 *
 * Screen-blend and per-channel tinting are both expressible in plain Canvas2D
 * (`globalCompositeOperation = 'screen'` + a multiply tint), so no WebGL/SkSL
 * runtime is needed — we get the same red/blue fringing for free, and there's no
 * clip to download. Drawn in 1920×1080 scene-space (16:9) and scaled to fit.
 *
 * Timeline (loops): wait → slam in → settle (easeOutQuart) → hold → angle sweep
 * → hold → clear → hold.
 */

// ── Scene constants (scene-space, 1920×1080) ────────────────────────────────
const SCENE_W = 1920;
const SCENE_H = 1080;
const CENTER_X = SCENE_W / 2;
const CENTER_Y = SCENE_H / 2;
const BG = '#0a0a0f';
const FONT = '"DM Sans Variable", ui-sans-serif, system-ui, sans-serif';

// `y` is +up in the engine, so screen offset is -y.
const TITLE_CY = CENTER_Y + 230; // sits below the box
const BOX_CY = CENTER_Y - 80; // y={80} → 80 above center
const BOX_SIZE = 400;
const BOX_RADIUS = 12;

const easeOutQuart = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 4);
const linear = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ── Timeline ─────────────────────────────────────────────────────────────────
// Each segment: [t0, t1, amount0, amount1, angle0, angle1, ease]. A punchy 2s
// loop: a slam at the top, a quick settle to a still-strong baseline, then a
// full 360° angle sweep so the aberration never clears and the loop is seamless.
type Seg = [number, number, number, number, number, number, (t: number) => number];

const TITLE: Seg[] = [
  [0.0, 0.1, 8, 24, 0, 0, linear], // slam in
  [0.1, 0.6, 24, 8, 0, 0, easeOutQuart], // settle to strong baseline
  [0.6, 2.0, 8, 8, 0, 360, linear], // angle sweep, wraps to start
];

const BOX: Seg[] = [
  [0.0, 0.1, 7, 20, 45, 45, linear],
  [0.1, 0.6, 20, 7, 45, 45, easeOutQuart],
  [0.6, 2.0, 7, 7, 45, 405, linear],
];

const LOOP = 2.0;

interface CA {
  amount: number;
  angle: number;
}

function sample(segs: Seg[], t: number): CA {
  for (const [t0, t1, a0, a1, g0, g1, ease] of segs) {
    if (t >= t0 && t < t1) {
      const e = ease((t - t0) / (t1 - t0));
      return { amount: lerp(a0, a1, e), angle: lerp(g0, g1, e) };
    }
  }
  const last = segs[segs.length - 1];
  return { amount: last[3], angle: last[5] };
}

// ── Offscreen buffers (sized to the backing store) ──────────────────────────
interface Buffers {
  el: HTMLCanvasElement; // one element rendered in full colour
  tint: HTMLCanvasElement; // reused per channel ghost
  w: number;
  h: number;
}

function makeBuffers(w: number, h: number): Buffers {
  const el = document.createElement('canvas');
  const tint = document.createElement('canvas');
  el.width = tint.width = w;
  el.height = tint.height = h;
  return { el, tint, w, h };
}

/** Build a single-channel ghost of `el` into `tint` (multiply tint, keep alpha). */
function tintChannel(buf: Buffers, color: string) {
  const c = buf.tint.getContext('2d')!;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, buf.w, buf.h);
  c.drawImage(buf.el, 0, 0);
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = color;
  c.fillRect(0, 0, buf.w, buf.h);
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(buf.el, 0, 0);
  c.globalCompositeOperation = 'source-over';
}

/**
 * Render `draw` into the element buffer, then composite it onto `ctx` with
 * chromatic aberration: full source + red ghost (+offset) + blue ghost
 * (-offset), the ghosts Screen-blended. `scale` maps scene-space → device px.
 */
function drawWithCA(
  ctx: CanvasRenderingContext2D,
  buf: Buffers,
  scale: number,
  ca: CA,
  draw: (c: CanvasRenderingContext2D) => void,
) {
  const elc = buf.el.getContext('2d')!;
  elc.setTransform(1, 0, 0, 1, 0, 0);
  elc.clearRect(0, 0, buf.w, buf.h);
  elc.setTransform(scale, 0, 0, scale, 0, 0);
  draw(elc);

  ctx.setTransform(1, 0, 0, 1, 0, 0); // composite in device px
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(buf.el, 0, 0); // full-colour source

  if (ca.amount > 0.01) {
    const rad = (ca.angle * Math.PI) / 180;
    const dx = Math.cos(rad) * ca.amount * scale;
    const dy = Math.sin(rad) * ca.amount * scale;
    ctx.globalCompositeOperation = 'screen';
    tintChannel(buf, '#ff0000');
    ctx.drawImage(buf.tint, dx, dy);
    tintChannel(buf, '#0000ff');
    ctx.drawImage(buf.tint, -dx, -dy);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ── Element drawing (scene-space) ───────────────────────────────────────────
function drawTitle(c: CanvasRenderingContext2D) {
  c.font = `900 120px ${FONT}`;
  c.fillStyle = '#ffffff';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.letterSpacing = '12px';
  c.fillText('IMPACT', CENTER_X - 6, TITLE_CY); // nudge for trailing letter-spacing
  c.letterSpacing = '0px';
}

function drawBox(c: CanvasRenderingContext2D) {
  const x = CENTER_X - BOX_SIZE / 2;
  const y = BOX_CY - BOX_SIZE / 2;
  const grad = c.createLinearGradient(0, y, 0, y + BOX_SIZE);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#cccccc');
  c.fillStyle = grad;
  c.beginPath();
  c.roundRect(x, y, BOX_SIZE, BOX_SIZE, BOX_RADIUS);
  c.fill();
}

export default function EffectsCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (document.fonts?.load) document.fonts.load(`900 120px ${FONT}`);

    let raf = 0;
    let visible = true;
    let start = performance.now();
    let buffers = makeBuffers(1, 1);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrapper.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      buffers = makeBuffers(canvas.width, canvas.height);
    };
    resize();

    const render = (now: number) => {
      const t = (((now - start) / 1000) % LOOP + LOOP) % LOOP;
      const scale = canvas.width / SCENE_W; // scene and frame are both 16:9

      // Background (device px).
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      drawWithCA(ctx, buffers, scale, sample(TITLE, t), drawTitle);
      drawWithCA(ctx, buffers, scale, sample(BOX, t), drawBox);

      raf = visible ? requestAnimationFrame(render) : 0;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrapper);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !visible) {
          visible = true;
          start = performance.now();
          raf = requestAnimationFrame(render);
        } else if (!entry.isIntersecting) {
          visible = false;
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { threshold: 0.01 },
    );
    io.observe(wrapper);

    raf = requestAnimationFrame(render);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <div ref={wrapperRef} className="absolute inset-0 h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
