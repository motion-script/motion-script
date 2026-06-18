import React from 'react';
import SceneCanvas, { easings, ramp, lerp, type DrawFn } from './SceneCanvas';

/**
 * Live Canvas2D illustrations for each Getting Started page. Every scene below
 * reproduces the exact example built in the corresponding page's prose, so the
 * picture and the code stay in lock-step. Coordinates are scene-space
 * (1920×1080, y-up, center origin) — see `SceneCanvas` for the runtime.
 */

const BLUE = '#4f80ff';
const PINK = '#e84393';
const PANEL = '#1e293b';

// ── 1. Scene: a single static blue square ───────────────────────────────────
const drawScene: DrawFn = (ctx, _t, h) => {
  h.rect(ctx, { cx: 0, cy: 0, w: 200, h: 200, fill: BLUE, radius: 16 });
};

export function FirstSceneCanvas() {
  return <SceneCanvas draw={drawScene} loop={3} caption="A 200×200 blue square, centered." />;
}

// ── 2. Animating: square slides right + rotates (easeOutBack), then back ─────
const drawAnimating: DrawFn = (ctx, t, h) => {
  // 0–1s out, 1–1.5s hold, 1.5–2.5s back, then hold to loop end (3s).
  const x = t < 1.5
    ? ramp(t, 0, 1, 0, 400, easings.easeOutBack)
    : ramp(t, 1.5, 2.5, 400, 0, easings.easeOutBack);
  const rot = t < 1.5
    ? ramp(t, 0, 1, 0, 180, easings.easeOutBack)
    : ramp(t, 1.5, 2.5, 180, 360, easings.easeOutBack);

  ctx.save();
  ctx.translate(x, 0);
  ctx.rotate((rot * Math.PI) / 180);
  h.rect(ctx, { cx: 0, cy: 0, w: 200, h: 200, fill: BLUE, radius: 16 });
  ctx.restore();
};

export function AnimatingCanvas() {
  return <SceneCanvas draw={drawAnimating} loop={3} caption="Slide and spin with .to() and easeOutBack." />;
}

// ── 3. Text: title fades + drifts up into place ─────────────────────────────
const drawText: DrawFn = (ctx, t, h) => {
  const opacity = ramp(t, 0.3, 1.1, 0, 1, easings.easeOut);
  const y = ramp(t, 0.3, 1.1, -20, 0, easings.easeOut);
  h.text(ctx, { cx: 0, cy: y, text: 'Motion Script', size: 110, weight: 800, fill: '#ffffff', opacity });
};

export function TextCanvas() {
  return <SceneCanvas draw={drawText} loop={3} caption="A Text title fading and drifting into place." />;
}

// ── 4. Layouts: a column card (square + title) whose gap animates open ───────
const drawLayout: DrawFn = (ctx, t, h) => {
  const PAD = 44;
  const SQUARE = 110;
  const TITLE_H = 56;
  const TITLE_FONT = 52;
  const gap = ramp(t, 0.4, 1.4, 22, 90, easings.easeOut);

  // Column lays out top→bottom; the card hugs its content.
  const contentH = SQUARE + gap + TITLE_H;
  const cardH = contentH + PAD * 2;
  const cardW = 520;

  // Card panel.
  h.rect(ctx, { cx: 0, cy: 0, w: cardW, h: cardH, fill: PANEL, radius: 22 });

  // Children stacked from the top of the content box, centered (align="center").
  const topY = contentH / 2; // y-up: top is positive
  const squareCy = topY - SQUARE / 2;
  const titleCy = topY - SQUARE - gap - TITLE_H / 2;

  h.rect(ctx, { cx: 0, cy: squareCy, w: SQUARE, h: SQUARE, fill: BLUE, radius: 16 });
  h.text(ctx, { cx: 0, cy: titleCy, text: 'Motion Script', size: TITLE_FONT, weight: 700, fill: '#ffffff' });
};

export function LayoutCanvas() {
  return <SceneCanvas draw={drawLayout} loop={3} caption="A column layout whose gap animates open." />;
}

// ── 5. Effects: the card pulls from a blur into focus ───────────────────────
const drawEffects: DrawFn = (ctx, t, h) => {
  const PAD = 44;
  const SQUARE = 110;
  const GAP = 28;
  const TITLE_H = 56;
  const contentH = SQUARE + GAP + TITLE_H;
  const cardH = contentH + PAD * 2;
  const cardW = 520;

  // blur 20→0 over 1s, hold, then back to 20 near the loop end so it loops.
  const blur = t < 2.2
    ? ramp(t, 0.2, 1.2, 20, 0, easings.easeOut)
    : ramp(t, 2.2, 3.0, 0, 20, easings.easeOut);

  ctx.save();
  (ctx as any).filter = `blur(${blur}px)`;

  h.rect(ctx, { cx: 0, cy: 0, w: cardW, h: cardH, fill: PANEL, radius: 22 });
  const topY = contentH / 2;
  h.rect(ctx, { cx: 0, cy: topY - SQUARE / 2, w: SQUARE, h: SQUARE, fill: BLUE, radius: 16 });
  h.text(ctx, { cx: 0, cy: topY - SQUARE - GAP - TITLE_H / 2, text: 'Motion Script', size: 52, weight: 700, fill: '#ffffff' });

  (ctx as any).filter = 'none';
  ctx.restore();
};

export function EffectsCanvas() {
  return <SceneCanvas draw={drawEffects} loop={3} caption="A focus pull: the card resolves from blur to crisp." />;
}

// ── 6. Masks: an iris reveal — a growing circle clips the card ───────────────
const drawMasks: DrawFn = (ctx, t, h) => {
  const PAD = 44;
  const SQUARE = 110;
  const GAP = 28;
  const TITLE_H = 56;
  const contentH = SQUARE + GAP + TITLE_H;
  const cardH = contentH + PAD * 2;
  const cardW = 520;

  // mask circle grows 0→900 (easeInOut), holds, then shrinks back for the loop.
  const d = t < 2.3
    ? ramp(t, 0.2, 1.4, 0, 900, easings.easeInOut)
    : ramp(t, 2.3, 3.0, 900, 0, easings.easeInOut);

  ctx.save();
  // Clip to the mask circle (first child of the MaskGroup).
  ctx.beginPath();
  ctx.ellipse(0, 0, d / 2, d / 2, 0, 0, Math.PI * 2);
  ctx.clip();

  // Clipped content: the card.
  h.rect(ctx, { cx: 0, cy: 0, w: cardW, h: cardH, fill: PANEL, radius: 22 });
  const topY = contentH / 2;
  h.rect(ctx, { cx: 0, cy: topY - SQUARE / 2, w: SQUARE, h: SQUARE, fill: BLUE, radius: 16 });
  h.text(ctx, { cx: 0, cy: topY - SQUARE - GAP - TITLE_H / 2, text: 'Motion Script', size: 52, weight: 700, fill: '#ffffff' });
  ctx.restore();
};

export function MaskCanvas() {
  return <SceneCanvas draw={drawMasks} loop={3} caption="An iris reveal: a growing circle masks the card." />;
}

// ── Bonus (masks page): a gradient shows through the word MOTION ─────────────
const drawTextMask: DrawFn = (ctx, t, h) => {
  // gentle gradient drift so it reads as animated, looping smoothly.
  const phase = (Math.sin((t / 3) * Math.PI * 2) + 1) / 2;
  const x0 = lerp(-700, -500, phase);
  const x1 = lerp(500, 700, phase);
  const grad = h.linearGradient(ctx, x0, x1, [BLUE, PINK]);
  h.text(ctx, { cx: 0, cy: 0, text: 'MOTION', size: 240, weight: 900, fill: grad, letterSpacing: 6 });
};

export function TextMaskCanvas() {
  return <SceneCanvas draw={drawTextMask} loop={3} caption="A gradient showing through the letters of a text mask." />;
}
