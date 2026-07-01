'use client'

import { useEffect, useRef } from 'react'

/**
 * Canvas reproduction of the `CodeScene` MotionScript demo.
 *
 * Like {@link LayoutCanvas} and {@link NumberCanvas}, this replaces a recorded
 * clip (`/code.mp4`) with a live Canvas2D rendering — nothing to download or
 * decode, crisp at any size. It draws a rounded "editor" window (traffic-light
 * dots + line-numbered, syntax-colored TypeScript) over the scene's
 * `background.jpg`, and runs the timeline of the scene: focus a line, focus a
 * word, clear, replace a token (`number` → `string`), remove a line, then
 * restore it so the loop is seamless. Focus is conveyed by fading the
 * non-focused code rather than drawing a highlight band behind it.
 *
 * Drawn in a 1920×1080 scene-space (16:9, matching the card's aspect-video
 * frame) and scaled uniformly. The code is auto-fit to the window so nothing
 * overflows regardless of font metrics.
 */

// ── Scene constants (scene-space, 1920×1080) ────────────────────────────────
const SCENE_W = 1920;
const SCENE_H = 1080;
const CENTER_X = SCENE_W / 2;
const CENTER_Y = SCENE_H / 2;

const COLORS = {
  bg: '#0f121a',
  titlebar: '#191C24',
  red: '#FF5252',
  yellow: '#FFD70A',
  green: '#29EC71',
  gutter: '#5c6370',
  // vscode-dark-ish token palette
  keyword: '#569cd6',
  fn: '#dcdcaa',
  type: '#4ec9b0',
  ident: '#9cdcfe',
  prop: '#9cdcfe',
  punct: '#d4d4d4',
  plain: '#d4d4d4',
};

const FONT = '"DM Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

// Editor window geometry (scene-space).
const WIN_W = 1320;
const TITLE_H = 88;
const CODE_PAD_X = 64;
const CODE_PAD_Y = 52;
const MAX_FONT_SIZE = 56; // upper bound; auto-fit may shrink it to avoid overflow
const LINE_RATIO = 1.5; // line height as a multiple of font size
const RADIUS = 28;
const DOT_R = 15;

// A token is a colored run of text on one logical line.
interface Tok {
  text: string;
  color: string;
}
type Line = Tok[];

// The scene's source, tokenized by hand (cheap + stable, no parser needed).
// function getUser(id: number) {
//   const user = db.find(id);
//   return user.name;
// }
const { keyword: K, fn: FN, type: TY, ident: ID, punct: PU, prop: PR } = COLORS;

function buildLines(idType: string): Line[] {
  return [
    [
      { text: 'function ', color: K },
      { text: 'getUser', color: FN },
      { text: '(', color: PU },
      { text: 'id', color: ID },
      { text: ': ', color: PU },
      { text: idType, color: TY },
      { text: ') {', color: PU },
    ],
    [
      { text: '  const ', color: K },
      { text: 'user', color: ID },
      { text: ' = ', color: PU },
      { text: 'db', color: ID },
      { text: '.', color: PU },
      { text: 'find', color: FN },
      { text: '(', color: PU },
      { text: 'id', color: ID },
      { text: ');', color: PU },
    ],
    [
      { text: '  return ', color: K },
      { text: 'user', color: ID },
      { text: '.', color: PU },
      { text: 'name', color: PR },
      { text: ';', color: PU },
    ],
    [{ text: '}', color: PU }],
  ];
}

// ── Timeline (seconds), mirroring the scene's yields ─────────────────────────
// A trailing `restore` segment re-grows the removed line so the end state
// matches the start state exactly — the loop has no visible jump.
const T = {
  wait0: 0.5,
  hlLine: 0.5,
  wait1: 0.6,
  hlWord: 0.4,
  wait2: 0.6,
  reset: 0.4,
  wait3: 0.3,
  replace: 0.3,
  wait4: 0.5,
  remove: 0.4,
  wait5: 0.8,
  restore: 0.4,
  wait6: 0.6,
} as const;

const MARKS = (() => {
  let t = 0;
  const m: Record<string, [number, number]> = {};
  const seg = (k: keyof typeof T) => {
    m[k] = [t, t + T[k]];
    t += T[k];
  };
  (Object.keys(T) as (keyof typeof T)[]).forEach(seg);
  return { m, total: t };
})();
const LOOP = MARKS.total;

const easeOutQuad = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * (2 - t);
};
// Progress 0→1 through a named segment at loop time `p`; 1 once past it.
function prog(p: number, key: keyof typeof T): number {
  const [a, b] = MARKS.m[key];
  if (p <= a) return 0;
  if (p >= b) return 1;
  return easeOutQuad((p - a) / (b - a));
}

interface State {
  idType: string;
  // line-2 highlight intensity 0→1
  lineHLAmt: number;
  // word highlight on line 3 ("user.name"): 0→1
  wordHL: number;
  // line 2 removal collapse: 0 (present) → 1 (gone)
  removeAmt: number;
}

function stateAt(time: number): State {
  const p = ((time % LOOP) + LOOP) % LOOP;
  const { m } = MARKS;

  // `number` → `string` during replace; reverts to `number` once line 2 has
  // fully collapsed (during `remove`), so by the time the window settles back
  // the start state is restored and the loop has no visible jump.
  const idType = p >= m.replace[1] && p < m.remove[1] ? 'string' : 'number';

  // Line-2 highlight rises, holds through the word phase, then clears on reset.
  let lineHLAmt = 0;
  if (p >= m.hlLine[0] && p < m.reset[0]) lineHLAmt = prog(p, 'hlLine');
  else if (p >= m.reset[0] && p < m.reset[1]) lineHLAmt = 1 - prog(p, 'reset');

  // Word highlight on "user.name" (line index 2) — appears with hlWord, clears on reset.
  let wordHL = 0;
  if (p >= m.hlWord[0] && p < m.reset[0]) wordHL = prog(p, 'hlWord');
  else if (p >= m.reset[0] && p < m.reset[1]) wordHL = 1 - prog(p, 'reset');

  // Line 2 collapses on `remove`, holds gone through wait5, then re-grows on
  // `restore` — so the loop returns to its starting layout with no jump.
  let removeAmt = 0;
  if (p >= m.remove[0] && p < m.restore[0]) removeAmt = prog(p, 'remove');
  else if (p >= m.restore[0] && p < m.restore[1]) removeAmt = 1 - prog(p, 'restore');

  return { idType, lineHLAmt, wordHL, removeAmt };
}

// Scene-space dimensions, the loop length, and the painter are exported so the
// docs "Code" node demo can reuse this exact editor animation (see node-scenes).
export const CODE_SCENE = { W: SCENE_W, H: SCENE_H, LOOP } as const

export function drawScene(
  ctx: CanvasRenderingContext2D,
  time: number,
  bg: HTMLImageElement | null,
) {
  const s = stateAt(time);
  const lines = buildLines(s.idType);

  // Background image (cover-fit), tinted dark like the scene's image fill.
  if (bg && bg.complete && bg.naturalWidth > 0) {
    drawCover(ctx, bg, SCENE_W, SCENE_H);
    ctx.fillStyle = 'rgba(15,18,26,0.5)';
    ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  } else {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  }

  // Auto-fit: pick the largest font (≤ MAX_FONT_SIZE) whose widest line plus the
  // gutter fits inside the window's code area, so nothing ever overflows.
  const innerW = WIN_W - CODE_PAD_X * 2;
  const fontSize = fitFontSize(ctx, lines, innerW);
  const lineH = fontSize * LINE_RATIO;
  ctx.font = `500 ${fontSize}px ${FONT}`;
  ctx.textBaseline = 'top';

  // Window height: title + padding + visible lines (line 2 collapses on remove).
  const lineHeights = lines.map((_, i) => (i === 1 ? lineH * (1 - s.removeAmt) : lineH));
  const codeH = lineHeights.reduce((a, b) => a + b, 0);
  const winH = TITLE_H + CODE_PAD_Y * 2 + codeH;
  const winX = CENTER_X - WIN_W / 2;
  const winY = CENTER_Y - winH / 2;

  // Window body.
  roundRect(ctx, winX, winY, WIN_W, winH, RADIUS);
  ctx.fillStyle = COLORS.bg;
  ctx.fill();

  // Title bar.
  ctx.save();
  roundRect(ctx, winX, winY, WIN_W, winH, RADIUS);
  ctx.clip();
  ctx.fillStyle = COLORS.titlebar;
  ctx.fillRect(winX, winY, WIN_W, TITLE_H);
  ctx.restore();

  // Traffic-light dots.
  const dotY = winY + TITLE_H / 2;
  const dotColors = [COLORS.red, COLORS.yellow, COLORS.green];
  dotColors.forEach((c, i) => {
    ctx.beginPath();
    ctx.ellipse(winX + 56 + i * 48, dotY, DOT_R, DOT_R, 0, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  });

  // Code area.
  const codeX = winX + CODE_PAD_X;
  const gutterW = ctx.measureText('0 ').width + 24;
  const textX = codeX + gutterW;
  let y = winY + TITLE_H + CODE_PAD_Y;

  // Highlighting now works by *fading the rest* rather than drawing a band:
  // when a line (index 1) or the "user.name" word (line index 2) is the focus,
  // everything that isn't the focus dims toward `DIM`. The strongest active
  // highlight wins so the two phases blend smoothly.
  const DIM = 0.28; // resting opacity of de-emphasized code
  const focus = Math.max(s.lineHLAmt, s.wordHL); // 0 = nothing dimmed, 1 = fully focused
  // Index of the highlighted run within line 2 (index 2): tokens "user"."name".
  const isWordTok = (li: number, tok: Tok) =>
    li === 2 && (tok.text === 'user' || tok.text === '.' || tok.text === 'name');
  const isFocusLine = (li: number) =>
    (s.lineHLAmt >= s.wordHL && li === 1) || (s.wordHL > s.lineHLAmt && li === 2);

  // Draw gutter numbers + code text, dimming everything that isn't the focus.
  y = winY + TITLE_H + CODE_PAD_Y;
  let lineNo = 0;
  for (let i = 0; i < lines.length; i++) {
    const lh = lineHeights[i];
    const collapsing = i === 1 && s.removeAmt > 0;
    const removeAlpha = collapsing ? 1 - s.removeAmt : 1;
    if (lh > 1) {
      lineNo++;
      // A line that contains the focus stays bright; others fade to DIM.
      const lineEmph = isFocusLine(i) ? 1 : 1 - focus * (1 - DIM);

      ctx.globalAlpha = removeAlpha * 0.8 * lineEmph;
      ctx.fillStyle = COLORS.gutter;
      ctx.fillText(String(lineNo), codeX, y);

      // Code tokens — during the word phase, only "user.name" stays bright.
      let tx = textX;
      for (const tok of lines[i]) {
        const bright = s.wordHL > s.lineHLAmt ? isWordTok(i, tok) : isFocusLine(i);
        const emph = bright ? 1 : 1 - focus * (1 - DIM);
        ctx.globalAlpha = removeAlpha * emph;
        ctx.fillStyle = tok.color;
        ctx.fillText(tok.text, tx, y);
        tx += ctx.measureText(tok.text).width;
      }
      ctx.globalAlpha = 1;
    }
    y += lh;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, rr);
}

/** Draw `img` to cover an `w`×`h` box (like CSS object-fit: cover), centered. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const ir = img.naturalWidth / img.naturalHeight;
  const br = w / h;
  let dw = w;
  let dh = h;
  if (ir > br) dw = h * ir;
  else dh = w / ir;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/**
 * Largest font size ≤ MAX_FONT_SIZE such that the widest line — gutter +
 * monospace code — fits within `innerW`. Measured against the widest possible
 * line ("number" variant), so the size never changes mid-loop and the layout
 * stays stable as tokens swap.
 */
function fitFontSize(ctx: CanvasRenderingContext2D, _lines: Line[], innerW: number): number {
  // Widest line across both `number`/`string` states is line 2 (the db.find call).
  const widest = '  const user = db.find(id);';
  const gutter = '0 ' + ' '.repeat(2); // line number + gap, ~3 mono chars
  const sample = gutter + widest;
  // Measure once at MAX_FONT_SIZE and scale down proportionally (monospace ⇒ linear).
  ctx.font = `500 ${MAX_FONT_SIZE}px ${FONT}`;
  const wAtMax = ctx.measureText(sample).width;
  if (wAtMax <= innerW) return MAX_FONT_SIZE;
  return Math.floor(MAX_FONT_SIZE * (innerW / wAtMax));
}

export default function CodeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (document.fonts?.load) {
      document.fonts.load(`500 100px ${FONT}`);
    }

    // Scene background — drawn once loaded; until then we fall back to a solid fill.
    const bg = new Image();
    bg.src = '/background.jpg';

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
      drawScene(ctx, time, bg);
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
