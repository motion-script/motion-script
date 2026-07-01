'use client'

import { useEffect, useRef } from 'react'

/**
 * Canvas reproduction of a MotionScript text-path demo.
 *
 * Like {@link LayoutCanvas}, this replaces a recorded clip with a live Canvas2D
 * rendering — nothing to download or decode, crisp at any size. A line of text
 * is laid out along a circular path so it wraps the full ring, and the whole
 * ring rotates slowly and continuously. A small cream label sits at the center.
 *
 * Drawn in a 1920×1080 scene-space (16:9, matching the card's aspect-video
 * frame) and scaled uniformly to the canvas. Font is DM Sans Variable (the
 * variable font the site already loads).
 */

// ── Scene constants (scene-space, 1920×1080) ────────────────────────────────
const SCENE_W = 1920;
const SCENE_H = 1080;
const CENTER_X = SCENE_W / 2;
const CENTER_Y = SCENE_H / 2;

const CREAM = '#F5ECD7';
const RING_COLOR = '#FFFFFF'; // white circular text; per-ring opacity applied below
const BG = '#0A0A0F';

const FONT = '"DM Sans Variable", ui-sans-serif, system-ui, sans-serif';

// ── Ring text ────────────────────────────────────────────────────────────────
// Three concentric rings, each smaller toward the center. The text fits exactly
// once around each ring's circumference, with font size and weight scaled down
// for the inner rings. They spin at different speeds and directions for depth.
const RING_WEIGHT = 700;
interface Ring {
  radius: number;
  fontSize: number;
  text: string;
  period: number; // seconds per full revolution (negative = counter-clockwise)
  opacity: number; // inner rings fade out more
}
const RINGS: Ring[] = [
  { radius: 380, fontSize: 64, text: 'MOTION SCRIPT  •  ANIMATE WITH CODE  •  ', period: 30, opacity: 0.5 },
  { radius: 270, fontSize: 48, text: 'DECLARATIVE  •  COMPOSABLE  •  TYPED  •  ', period: -22, opacity: 0.3 },
  { radius: 170, fontSize: 34, text: 'RENDER  •  EXPORT  •  SHARE  •  ', period: 16, opacity: 0.15 },
];

// Center label.
const LABEL_TEXT = 'MS';
const LABEL_SIZE = 96;
const LABEL_WEIGHT = 800;

function font(size: number, weight: number): string {
  return `${weight} ${size}px ${FONT}`;
}

/**
 * Draw `text` wrapped around a circle of `radius` centered at the origin (the
 * caller sets the transform). Glyphs are spaced by their measured width so the
 * line reads naturally, and each is rotated to sit tangent to the ring.
 */
function drawTextRing(ctx: CanvasRenderingContext2D, text: string, radius: number) {
  // Total angular span needed if we placed every glyph by its true width.
  let totalWidth = 0;
  for (const ch of text) totalWidth += ctx.measureText(ch).width;

  // Scale so the text wraps exactly once around the full circle.
  const circumference = 2 * Math.PI * radius;
  const scale = circumference / totalWidth;

  let angle = -Math.PI / 2; // start at the top
  for (const ch of text) {
    const w = ctx.measureText(ch).width * scale;
    const step = w / radius; // angular width of this glyph
    const a = angle + step / 2;

    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -radius);
    ctx.fillText(ch, 0, 0);
    ctx.restore();

    angle += step;
  }
}

function drawScene(ctx: CanvasRenderingContext2D, time: number) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Spinning text rings — each at its own radius, size, speed and direction.
  ctx.fillStyle = RING_COLOR;
  ctx.letterSpacing = '0px';
  for (const ring of RINGS) {
    const rotation = (time / ring.period) * Math.PI * 2;
    ctx.save();
    ctx.translate(CENTER_X, CENTER_Y);
    ctx.rotate(rotation);
    ctx.globalAlpha = ring.opacity;
    ctx.font = font(ring.fontSize, RING_WEIGHT);
    drawTextRing(ctx, ring.text, ring.radius);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // Static center label.
  ctx.fillStyle = CREAM;
  ctx.font = font(LABEL_SIZE, LABEL_WEIGHT);
  ctx.fillText(LABEL_TEXT, CENTER_X, CENTER_Y);
}

export default function NumberCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (document.fonts?.load) {
      document.fonts.load(`${RING_WEIGHT} 100px ${FONT}`);
      document.fonts.load(`${LABEL_WEIGHT} 100px ${FONT}`);
    }

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
      const time = (now - start) / 1000;
      const scale = canvas.width / SCENE_W; // scene and frame are both 16:9
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawScene(ctx, time);
      raf = visible ? requestAnimationFrame(render) : 0;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrapper);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !visible) {
          visible = true;
          start = performance.now(); // restart the loop from the top when revealed
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
