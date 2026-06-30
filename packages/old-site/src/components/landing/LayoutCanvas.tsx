import React, { useEffect, useRef } from 'react';

/**
 * Canvas reproduction of the `LayoutScene` MotionScript demo.
 *
 * This used to ship as `/layout.mp4`. The animation is purely a few rounded
 * rectangles reflowing under an animated flexbox, so rendering it live with the
 * Canvas2D API is far cheaper than decoding a video — no network fetch, no
 * decode pipeline, and it stays crisp at any size.
 *
 * The geometry mirrors the engine 1:1: a 1920×1080 scene (16:9, matching the
 * card's aspect-video frame) with a fixed 1000×600 row centered inside it. Flex
 * shares, gaps (20), padding (10), center alignment, inside stroke, and the
 * `easeOutQuad` timing all follow `@motion-script/core`'s `layoutFlex`.
 */

// ── Scene constants (scene-space, 1920×1080) ────────────────────────────────
const SCENE_W = 1920;
const SCENE_H = 1080;
const CENTER_X = SCENE_W / 2;
const CENTER_Y = SCENE_H / 2;

const ROW_W = 1000;
const ROW_H = 600;
const ROW_PAD = 10;
const GAP = 20;

const COLORS = {
  bg: '#0D0F15',
  panel: '#161a21',
  accent: '#FF6470',
  white: '#ffffff',
};

const RADIUS = { panel: 8, accent: 4 };
const STROKE_WEIGHT = 12; // white inside stroke on the accent panel
const DOT_SIZE = 32; // white ellipse centered in the accent panel

const LOOP = 4.0; // seconds
const SEG = 1; // seconds per segment

const easeOutQuad = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * (2 - t);
};

interface Flex {
  colA: number;
  colB: number;
  rowA: number;
}

/** Resolve the animated flex weights at a given loop time (0…LOOP). */
function flexAt(p: number): Flex {
  // Segment 1: colA 1→2, colB 2→1   | Segment 2: rowA 2→1
  // Segment 3: colA 2→1, colB 1→2   | Segment 4: rowA 1→2
  if (p < SEG) {
    const u = easeOutQuad(p / SEG);
    return { colA: 1 + u, colB: 2 - u, rowA: 2 };
  }
  if (p < 2 * SEG) {
    const u = easeOutQuad((p - SEG) / SEG);
    return { colA: 2, colB: 1, rowA: 2 - u };
  }
  if (p < 3 * SEG) {
    const u = easeOutQuad((p - 2 * SEG) / SEG);
    return { colA: 2 - u, colB: 1 + u, rowA: 1 };
  }
  const u = easeOutQuad((p - 3 * SEG) / SEG);
  return { colA: 1, colB: 2, rowA: 1 + u };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function roundRectPath(ctx: CanvasRenderingContext2D, b: Box, r: number) {
  const rr = Math.max(0, Math.min(r, b.w / 2, b.h / 2));
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, rr);
}

function fillPanel(ctx: CanvasRenderingContext2D, b: Box, color: string, r: number) {
  roundRectPath(ctx, b, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawScene(ctx: CanvasRenderingContext2D, time: number) {
  const p = ((time % LOOP) + LOOP) % LOOP;
  const { colA: fa, colB: fc, rowA: fra } = flexAt(p);

  // Background.
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);

  // Row container, centered, inner area after padding.
  const innerX = CENTER_X - ROW_W / 2 + ROW_PAD;
  const innerY = CENTER_Y - ROW_H / 2 + ROW_PAD;
  const innerW = ROW_W - ROW_PAD * 2;
  const innerH = ROW_H - ROW_PAD * 2;

  // Horizontal flex: colA, middle (fixed flex 2), colB. Three children → two gaps.
  const fMiddle = 2;
  const distributableW = innerW - GAP * 2;
  const sumX = fa + fMiddle + fc;
  const colAW = (distributableW * fa) / sumX;
  const midW = (distributableW * fMiddle) / sumX;
  const colBW = (distributableW * fc) / sumX;

  const colA: Box = { x: innerX, y: innerY, w: colAW, h: innerH };
  const midX = innerX + colAW + GAP;
  const colB: Box = { x: midX + midW + GAP, y: innerY, w: colBW, h: innerH };

  // Middle column: vertical flex of rowA (animated) and rowB (fixed flex 1).
  const distributableH = innerH - GAP;
  const sumY = fra + 1;
  const rowAH = (distributableH * fra) / sumY;
  const rowBH = (distributableH * 1) / sumY;
  const rowA: Box = { x: midX, y: innerY, w: midW, h: rowAH };
  const rowB: Box = { x: midX, y: innerY + rowAH + GAP, w: midW, h: rowBH };

  // Panels.
  fillPanel(ctx, colA, COLORS.panel, RADIUS.panel);
  fillPanel(ctx, colB, COLORS.panel, RADIUS.panel);
  fillPanel(ctx, rowB, COLORS.panel, RADIUS.panel);

  // Accent panel (red) with inside white stroke.
  fillPanel(ctx, rowA, COLORS.accent, RADIUS.accent);
  const inset = STROKE_WEIGHT / 2; // canvas centers the stroke on the path
  const strokeBox: Box = {
    x: rowA.x + inset,
    y: rowA.y + inset,
    w: rowA.w - STROKE_WEIGHT,
    h: rowA.h - STROKE_WEIGHT,
  };
  if (strokeBox.w > 0 && strokeBox.h > 0) {
    roundRectPath(ctx, strokeBox, Math.max(0, RADIUS.accent - inset));
    ctx.lineWidth = STROKE_WEIGHT;
    ctx.strokeStyle = COLORS.white;
    ctx.stroke();
  }

  // White dot centered in the accent panel.
  ctx.beginPath();
  ctx.ellipse(
    rowA.x + rowA.w / 2,
    rowA.y + rowA.h / 2,
    DOT_SIZE / 2,
    DOT_SIZE / 2,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = COLORS.white;
  ctx.fill();
}

export default function LayoutCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let visible = true;
    let start = performance.now();

    // Keep the backing store matched to the displayed size × dpr for crisp edges.
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrapper.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();

    const render = (now: number) => {
      const time = (now - start) / 1000;
      // Scene is 16:9 and so is the frame, so a uniform scale fills it exactly.
      const scale = canvas.width / SCENE_W;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawScene(ctx, time);
      raf = visible ? requestAnimationFrame(render) : 0;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrapper);

    // Pause off-screen to avoid burning a rAF loop the user can't see.
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
