import React, { useEffect, useRef } from 'react';

/**
 * Shared canvas runtime for the Getting Started tutorial illustrations.
 *
 * Each tutorial page builds a small MotionScript scene in prose; these canvases
 * reproduce that scene live with the Canvas2D API so readers can see the result
 * without rendering a video. They are illustrations, not the engine — but they
 * mirror its conventions so the picture matches the code:
 *
 *   - a fixed 1920×1080 scene-space (16:9), scaled to fit the frame;
 *   - the engine's y-up, center-origin coordinate space (translate to center,
 *     flip y) so `x`/`y`/`align` read the same as in the docs;
 *   - a looping timeline driven by `requestAnimationFrame`;
 *   - paused via IntersectionObserver when scrolled out of view;
 *   - DPR-aware backing store via ResizeObserver.
 *
 * A page supplies a `draw(ctx, t, h)` callback that paints one frame at loop
 * time `t` (seconds). `ctx` is already in scene-space with y pointing up and the
 * origin at the scene center. `h` carries the easings and drawing helpers the
 * pages share, so each scene stays tiny.
 */

const SCENE_W = 1920;
const SCENE_H = 1080;
const BG = '#0a0a0f';
export const FONT = '"DM Sans Variable", ui-sans-serif, system-ui, sans-serif';

// ── Math + easings (match @motion-script/core's named easings) ──────────────
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const easings = {
  linear: clamp01,
  easeOut: (t: number) => 1 - Math.pow(1 - clamp01(t), 3),
  easeInOut: (t: number) => {
    t = clamp01(t);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  },
  easeOutBack: (t: number) => {
    t = clamp01(t);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

export type Easing = (t: number) => number;

/** Ramp `from`→`to` over [t0, t1] of the loop, holding the end value after. */
export function ramp(t: number, t0: number, t1: number, from: number, to: number, ease: Easing = easings.linear) {
  if (t <= t0) return from;
  if (t >= t1) return to;
  return lerp(from, to, ease((t - t0) / (t1 - t0)));
}

// ── Drawing helpers (scene-space, y-up, center origin) ──────────────────────
export interface Helpers {
  /** Filled, rounded rectangle centered at (cx, cy). */
  rect(c: CanvasRenderingContext2D, opts: {
    cx: number; cy: number; w: number; h: number;
    fill?: string | CanvasGradient; radius?: number;
    stroke?: string; strokeWidth?: number; opacity?: number;
  }): void;
  /** Centered text (y-up: drawn upright despite the flipped axis). */
  text(c: CanvasRenderingContext2D, opts: {
    cx: number; cy: number; text: string;
    size: number; weight?: number; fill?: string | CanvasGradient;
    opacity?: number; letterSpacing?: number;
  }): void;
  /** Filled ellipse centered at (cx, cy). */
  ellipse(c: CanvasRenderingContext2D, opts: {
    cx: number; cy: number; w: number; h: number; fill?: string; opacity?: number;
  }): void;
  /** A horizontal linear gradient spanning [x0, x1] at scene y. */
  linearGradient(c: CanvasRenderingContext2D, x0: number, x1: number, colors: string[]): CanvasGradient;
}

const helpers: Helpers = {
  rect(c, { cx, cy, w, h, fill = '#ffffff', radius = 0, stroke, strokeWidth = 0, opacity = 1 }) {
    c.save();
    c.globalAlpha *= opacity;
    c.beginPath();
    c.roundRect(cx - w / 2, cy - h / 2, w, h, radius);
    c.fillStyle = fill;
    c.fill();
    if (stroke && strokeWidth > 0) {
      c.lineWidth = strokeWidth;
      c.strokeStyle = stroke;
      c.stroke();
    }
    c.restore();
  },
  text(c, { cx, cy, text, size, weight = 400, fill = '#ffffff', opacity = 1, letterSpacing = 0 }) {
    c.save();
    c.globalAlpha *= opacity;
    // Undo the y-flip locally so glyphs render upright.
    c.translate(cx, cy);
    c.scale(1, -1);
    c.font = `${weight} ${size}px ${FONT}`;
    c.fillStyle = fill;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (letterSpacing) (c as any).letterSpacing = `${letterSpacing}px`;
    c.fillText(text, 0, 0);
    if (letterSpacing) (c as any).letterSpacing = '0px';
    c.restore();
  },
  ellipse(c, { cx, cy, w, h, fill = '#ffffff', opacity = 1 }) {
    c.save();
    c.globalAlpha *= opacity;
    c.beginPath();
    c.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    c.restore();
  },
  linearGradient(c, x0, x1, colors) {
    const g = c.createLinearGradient(x0, 0, x1, 0);
    colors.forEach((col, i) => g.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), col));
    return g;
  },
};

export type DrawFn = (ctx: CanvasRenderingContext2D, t: number, h: Helpers) => void;

interface Props {
  /** Paints one frame at loop time `t` (seconds), in scene-space. */
  draw: DrawFn;
  /** Loop length in seconds. */
  loop: number;
  /** Optional caption shown beneath the frame. */
  caption?: string;
  /** Background color filled behind the scene. Defaults to the shared `BG`. */
  bg?: string;
  /**
   * CSS aspect-ratio of the frame (e.g. `'16 / 9'`, `'2 / 1'`). The horizontal
   * scale is always derived from width, so a shorter ratio just trims vertical
   * room without resizing the content. Defaults to 16:9.
   */
  aspect?: string;
}

export default function SceneCanvas({ draw, loop, caption, bg = BG, aspect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const bgRef = useRef(bg);
  bgRef.current = bg;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (document.fonts?.load) document.fonts.load(`700 80px ${FONT}`);

    let raf = 0;
    let visible = true;
    let start = performance.now();

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrapper.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();

    const render = (now: number) => {
      const t = ((((now - start) / 1000) % loop) + loop) % loop;
      const scale = canvas.width / SCENE_W; // scene and frame are both 16:9

      // Background, in device px.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = bgRef.current;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Enter scene-space: origin at center, y pointing up.
      ctx.setTransform(scale, 0, 0, -scale, canvas.width / 2, canvas.height / 2);
      ctx.globalAlpha = 1;
      drawRef.current(ctx, t, helpers);

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
  }, [loop]);

  return (
    <figure style={{ margin: '0 0 1.5rem' }}>
      <div
        ref={wrapperRef}
        className={`w-full overflow-hidden rounded-xl${aspect ? '' : ' aspect-video'}`}
        style={{
          border: '1px solid var(--ifm-toc-border-color, rgba(255,255,255,0.1))',
          ...(aspect ? { aspectRatio: aspect } : null),
        }}
      >
        <canvas ref={canvasRef} className="h-full w-full block" />
      </div>
      {caption && (
        <figcaption
          style={{ marginTop: '0.5rem', fontSize: '0.85rem', textAlign: 'center', color: 'var(--ifm-color-emphasis-600)' }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
