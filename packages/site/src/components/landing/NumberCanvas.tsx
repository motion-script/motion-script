import React, { useEffect, useRef } from 'react';

/**
 * Canvas reproduction of the `NumberScene` MotionScript demo.
 *
 * Like {@link LayoutCanvas}, this replaces a recorded clip with a live Canvas2D
 * rendering — nothing to download or decode, crisp at any size. A cream number
 * counts up to 244, then a stack of large, blurred, copper "ghost" copies and a
 * letter-spaced "COMMITS" label fade in behind it.
 *
 * Drawn in a 1920×1080 scene-space (16:9, matching the card's aspect-video
 * frame) and scaled uniformly to the canvas. Font is DM Sans Variable (the
 * variable font the site already loads). Geometry, colors, blur, and timing all
 * follow the scene 1:1.
 *
 * Timeline (loops): wait 0.3 → count 0→244 over 2.5s (easeOutQuad) → wait 0.1 →
 * label slides up + ghosts fade in → wait 1.5.
 */

// ── Scene constants (scene-space, 1920×1080) ────────────────────────────────
const SCENE_W = 1920;
const SCENE_H = 1080;
const CENTER_X = SCENE_W / 2;
const CENTER_Y = SCENE_H / 2;

const CREAM = '#F5ECD7';
const GHOST_COLOR = '#c2845d'; // cream with an orange tint
const BG = '#0f0e0d';

const FONT = '"DM Sans Variable", ui-sans-serif, system-ui, sans-serif';
const BASE_FONT_SIZE = 260;
const LABEL_SIZE = 52;
const LINE_HEIGHT = 1.2;
const Y_OFFSET = 30; // shared "y={30}" rise distance (scene treats +y as up)

// Ghost layers: sizes interpolated from BASE_FONT_SIZE up to ×1.8, target opacity 0.04.
const GHOST_COUNT = 8;
const GHOST_SCALE = 1.8;
const GHOST_OPACITY = 0.04;
const GHOSTS = Array.from({ length: GHOST_COUNT }, (_, i) => {
  const t = i / (GHOST_COUNT - 1);
  return Math.round(BASE_FONT_SIZE * (1 + t * (GHOST_SCALE - 1)));
});

// ── Timeline (seconds) ───────────────────────────────────────────────────────
const T_WAIT0 = 0.3;
const T_COUNT = 2.5;
const T_WAIT1 = 0.1;
const T_REVEAL = 0.6;
const T_WAIT2 = 1.5;
const COUNT_START = T_WAIT0;
const COUNT_END = COUNT_START + T_COUNT;
const REVEAL_START = COUNT_END + T_WAIT1;
const LOOP = COUNT_END + T_WAIT1 + T_REVEAL + T_WAIT2;

const easeOutQuad = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * (2 - t);
};
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

interface SceneState {
  number: string;
  ghostOpacity: number[];
  labelOpacity: number;
  labelRise: number; // remaining upward offset, 30 → 0
}

function stateAt(time: number): SceneState {
  const t = ((time % LOOP) + LOOP) % LOOP;

  // Main number counts 0 → 244, padded to 3 digits.
  let value = 0;
  if (t >= COUNT_END) value = 244;
  else if (t >= COUNT_START) value = Math.round(244 * easeOutQuad((t - COUNT_START) / T_COUNT));
  const number = String(value).padStart(3, '0');

  // Ghosts fade in after the count, each over its own (0.2 + i*0.01)s, linearly.
  const ghostOpacity = GHOSTS.map((_, i) => {
    if (t < REVEAL_START) return 0;
    return GHOST_OPACITY * clamp01((t - REVEAL_START) / (0.2 + i * 0.01));
  });

  // Label fades in and rises into place over T_REVEAL (easeOutQuad).
  const p = t < REVEAL_START ? 0 : easeOutQuad((t - REVEAL_START) / T_REVEAL);
  return { number, ghostOpacity, labelOpacity: p, labelRise: Y_OFFSET * (1 - p) };
}

function font(size: number, weight: number): string {
  return `${weight} ${size}px ${FONT}`;
}

function drawScene(ctx: CanvasRenderingContext2D, time: number) {
  const { number, ghostOpacity, labelOpacity, labelRise } = stateAt(time);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // The main number sits in a centered column with the label below it (gap 0).
  const mainH = BASE_FONT_SIZE * LINE_HEIGHT;
  const labelH = LABEL_SIZE * LINE_HEIGHT;
  const columnTop = CENTER_Y - (mainH + labelH) / 2;
  const numberCY = columnTop + mainH / 2;
  const labelCY = columnTop + mainH + labelH / 2;

  // Ghost stack: large, blurred, copper "244" copies centered and risen by 30.
  const ghostCY = CENTER_Y - Y_OFFSET;
  ctx.filter = 'blur(2px)';
  ctx.fillStyle = GHOST_COLOR;
  GHOSTS.forEach((size, i) => {
    if (ghostOpacity[i] <= 0) return;
    ctx.globalAlpha = ghostOpacity[i];
    ctx.font = font(size, 700);
    ctx.fillText('244', CENTER_X, ghostCY);
  });
  ctx.filter = 'none';
  ctx.globalAlpha = 1;

  // Sharp main number.
  ctx.fillStyle = CREAM;
  ctx.font = font(BASE_FONT_SIZE, 800);
  ctx.fillText(number, CENTER_X, numberCY);

  // Letter-spaced label, fading and rising into place.
  if (labelOpacity > 0) {
    ctx.globalAlpha = labelOpacity;
    ctx.fillStyle = GHOST_COLOR;
    ctx.font = font(LABEL_SIZE, 700);
    ctx.letterSpacing = '12px';
    // Trailing letter-spacing biases centering right; nudge back by half.
    ctx.fillText('COMMITS', CENTER_X - 6, labelCY - labelRise);
    ctx.letterSpacing = '0px';
    ctx.globalAlpha = 1;
  }
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
      document.fonts.load(`700 100px ${FONT}`);
      document.fonts.load(`800 100px ${FONT}`);
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
