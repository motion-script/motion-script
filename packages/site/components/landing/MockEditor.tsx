'use client'

import { useEffect, useRef } from 'react'

/**
 * A faked, animated MotionScript web editor — the DOM counterpart to the static
 * `/editor.jpg` it replaces in {@link EditorSection}. It reproduces the real
 * player's chrome as faithfully as a non-interactive mock can (see
 * packages/player: EditorLayout, VideoPreview, PlaybackControls, Timeline):
 *
 *   • a header (project name · zoom · Export);
 *   • a video preview (grid backdrop, top ruler, a ring-framed stage), and the
 *     transport row (mute · speed · prev · play · next · timecode · loop · cam);
 *   • a timeline — toolbar (collapse · layout · zoom slider on one strip), a
 *     ruler with frame ticks, and a node tree (names column + track bars), with
 *     a vertical playhead sweeping the ruler + tracks in lockstep.
 *
 * It is an *animation*, not the player — no engine behind it. A single rAF loop
 * advances a normalized clock `p ∈ [0,1)` looping every {@link LOOP}s that drives
 * everything together: the playhead slides, the timecode counts, and the preview
 * plays a tiny canned scene (a rounded card that rotates + corner-rounds,
 * mirroring the ProceduralSection snippet) and eases back so the loop is
 * seamless. Controls are decorative. Pauses when scrolled out of view.
 *
 * Colors are the player's own dark-theme tokens, inlined here since the site
 * doesn't define the player's CSS variables.
 */

// Palette built around a rgb(23,23,28) base gray for the editor chrome, sitting
// just above the landing-page background (#111116) so the mock blends into the
// page. Raised surfaces (track bars, tiles) step up from the base.
const C = {
  panel: '#17171c', // base gray — editor chrome (rgb 23,23,28)
  card: '#202028', // raised surfaces (track bars)
  primary: 'oklch(65.812% 0.12346 263.029)',
  muted: '#1c1c22',
  border: 'oklch(1 0 0 / 10%)',
  borderSoft: 'oklch(1 0 0 / 6%)',
  fg: 'oklch(0.985 0 0)',
  mutedFg: 'oklch(0.708 0 0)',
  bg: '#111116', // matches the landing-page background (stage / preview)
  grid: 'rgba(148, 163, 184, 0.07)',
};

const LOOP = 6; // seconds for one full timeline pass
const DURATION_S = 3.5; // fake project duration the timecode counts toward

// Node tree shown in the timeline. label + indent depth + bar span (start,len)
// as fractions of the track width — loosely a Rect with a Text child, etc.
const NODES: { label: string; depth: number; span: [number, number]; color: string }[] = [
  { label: 'Rect', depth: 0, span: [0.0, 1.0], color: C.card },
  { label: 'Text', depth: 1, span: [0.08, 0.62], color: C.card },
  { label: 'Ellipse', depth: 1, span: [0.34, 0.66], color: C.card },
];

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function fmt(p: number) {
  const t = p * DURATION_S;
  const s = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 1000);
  return `00:${s.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`;
}

export default function MockEditor() {
  const rootRef = useRef<HTMLDivElement>(null);
  const playheadRefs = useRef<HTMLDivElement[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const timecodeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let raf = 0;
    let visible = true;
    let start = performance.now();

    const frame = (now: number) => {
      const t = ((now - start) / 1000) % LOOP;
      const p = t / LOOP; // 0 → 1 across the timeline

      for (const ph of playheadRefs.current) {
        if (ph) ph.style.left = `${p * 100}%`;
      }

      if (cardRef.current) {
        // Canned scene: rotate + grow corner radius, easing back so it loops.
        const e = easeInOut(p < 0.5 ? p * 2 : (1 - p) * 2);
        cardRef.current.style.transform = `rotate(${e * 90}deg) scale(${0.85 + e * 0.2})`;
        cardRef.current.style.borderRadius = `${10 + e * 40}%`;
      }

      if (timecodeRef.current) timecodeRef.current.textContent = fmt(p);

      raf = visible ? requestAnimationFrame(frame) : 0;
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !visible) {
          visible = true;
          start = performance.now();
          raf = requestAnimationFrame(frame);
        } else if (!entry.isIntersecting && visible) {
          visible = false;
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { threshold: 0.01 },
    );
    io.observe(root);

    raf = requestAnimationFrame(frame);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  const setPlayhead = (i: number) => (el: HTMLDivElement | null) => {
    if (el) playheadRefs.current[i] = el;
  };

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 flex flex-col select-none [font-size:clamp(7px,1vw,12px)]"
      style={{ background: C.bg, color: C.fg, gap: '3px', padding: '3px' }}
    >
      <div className="flex flex-1 min-h-0" style={{ gap: '3px' }}>
        {/* ── Main column ─────────────────────────────────────────────── */}
        <div className="flex flex-1 min-w-0 flex-col" style={{ gap: '3px' }}>
          {/* preview block: header + preview + transport, in one panel */}
          <div className="flex flex-col flex-1 min-h-0 rounded-lg overflow-hidden" style={{ background: C.panel }}>
            {/* header */}
            <header
              className="grid grid-cols-3 items-center px-2.5 shrink-0"
              style={{ height: '11%', minHeight: '24px', borderBottom: `1px solid ${C.border}` }}
            >
              <span className="truncate text-[0.88em] font-medium" style={{ color: C.mutedFg }}>
                Square Animation
              </span>
              <span className="justify-self-center text-[0.82em] tabular-nums" style={{ color: C.mutedFg }}>
                100%
              </span>
              <span
                className="justify-self-end rounded-md px-2 py-0.5 text-[0.82em] font-medium"
                style={{ background: C.primary, color: C.fg }}
              >
                Export
              </span>
            </header>

            {/* video preview */}
            <div
              className="relative flex flex-1 items-center justify-center overflow-hidden min-h-0"
              style={{
                background: C.panel,
                backgroundImage: `linear-gradient(to right, ${C.grid} 1px, transparent 1px), linear-gradient(to bottom, ${C.grid} 1px, transparent 1px)`,
                backgroundSize: '22px 22px',
                backgroundPosition: 'center',
              }}
            >
              {/* top ruler ticks */}
              <div
                className="pointer-events-none absolute top-0 left-0 right-0 h-3 flex items-start"
                style={{ color: 'rgba(148,163,184,0.3)' }}
              >
                {Array.from({ length: 9 }).map((_, i) => (
                  <span key={i} className="flex-1 text-center text-[0.62em] leading-none pt-0.5 tabular-nums">
                    {i * 100}
                  </span>
                ))}
              </div>
              {/* the framed stage */}
              <div
                className="relative aspect-video w-[58%] max-w-[260px] flex items-center justify-center"
                style={{
                  background: C.bg,
                  outline: `2px solid ${C.border}`,
                  boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
                }}
              >
                <div
                  ref={cardRef}
                  className="aspect-square w-[26%] will-change-transform"
                  style={{
                    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                    borderRadius: '10%',
                  }}
                />
              </div>
            </div>

            {/* transport + timeline toolbar — one strip, like the real player:
                collapse + layout left, the transport centered, zoom slider right */}
            <div
              className="grid grid-cols-3 items-center px-2 shrink-0"
              style={{ height: '13%', minHeight: '26px', color: C.mutedFg, borderTop: `1px solid ${C.border}` }}
            >
              {/* left: timeline toolbar controls */}
              <div className="flex items-center gap-2 justify-self-start text-[1.35em]">
                <ChevronIcon />
                <LayoutIcon />
              </div>

              {/* center: transport */}
              <div className="flex items-center justify-center gap-2 justify-self-center">
                <MuteIcon />
                <span className="hidden sm:inline rounded px-1.5 py-0.5 text-[0.78em]" style={{ border: `1px solid ${C.border}` }}>
                  1x
                </span>
                <PrevIcon />
                <PlayIcon />
                <NextIcon />
                <span ref={timecodeRef} className="tabular-nums text-[0.82em]" style={{ color: C.fg }}>
                  00:00:000
                </span>
                <LoopIcon />
                <CameraIcon />
              </div>

              {/* right: zoom slider */}
              <div className="flex items-center gap-1.5 justify-self-end w-[40%] max-w-[120px] text-[1.35em]">
                <MinusIcon />
                <div className="relative flex-1 h-1 rounded-full" style={{ background: C.muted }}>
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: '55%', background: C.primary }} />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-[1em] w-[1em] rounded-full"
                    style={{ left: '55%', background: C.fg }}
                  />
                </div>
                <PlusIcon />
              </div>
            </div>
          </div>

          {/* ── Timeline panel ────────────────────────────────────────── */}
          <div
            className="shrink-0 rounded-lg overflow-hidden flex flex-col"
            style={{ height: '34%', minHeight: '92px', background: C.panel }}
          >
            {/* body: names column + ruler/scene/tracks */}
            <div className="flex flex-1 min-h-0">
              {/* node names column */}
              <div
                className="w-[24%] max-w-[130px] shrink-0 flex flex-col"
                style={{ borderRight: `1px solid ${C.border}` }}
              >
                {/* spacer aligning with the ruler */}
                <div className="shrink-0" style={{ height: '19%', minHeight: '12px', borderBottom: `1px solid ${C.borderSoft}` }} />
                {NODES.map((n) => (
                  <div
                    key={n.label}
                    className="flex items-center text-[0.95em] truncate"
                    style={{
                      flex: 1,
                      paddingLeft: `${0.4 + n.depth * 0.9}em`,
                      color: C.mutedFg,
                      borderBottom: `1px solid ${C.borderSoft}`,
                    }}
                  >
                    <span className="mr-1.5 h-[0.85em] w-[0.85em] shrink-0 rounded-[2px]" style={{ background: C.primary, opacity: 0.7 }} />
                    {n.label}
                  </div>
                ))}
              </div>

              {/* ruler + scene + track rows (playhead spans all) */}
              <div className="relative flex-1 min-w-0 flex flex-col overflow-hidden">
                {/* ruler */}
                <div
                  className="relative shrink-0 flex items-end px-1 pb-0.5"
                  style={{ height: '19%', minHeight: '12px', borderBottom: `1px solid ${C.borderSoft}` }}
                >
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex-1" style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: '2px' }}>
                      <span className="text-[0.6em] leading-none tabular-nums" style={{ color: C.mutedFg }}>
                        {i % 2 === 0 ? `${i * 10}f` : ''}
                      </span>
                    </div>
                  ))}
                </div>
                {/* track rows */}
                <div className="relative flex-1 min-h-0">
                  {NODES.map((n) => (
                    <div key={n.label} className="relative" style={{ height: `${100 / NODES.length}%`, borderBottom: `1px solid ${C.borderSoft}` }}>
                      <div
                        className="absolute rounded-[2px]"
                        style={{
                          top: '18%',
                          bottom: '18%',
                          left: `${n.span[0] * 100}%`,
                          width: `${n.span[1] * 100}%`,
                          background: n.color,
                          border: `1px solid ${C.border}`,
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* playhead — ruler diamond + full line */}
                <div ref={setPlayhead(0)} className="pointer-events-none absolute top-0 bottom-0" style={{ left: '0%', zIndex: 5 }}>
                  <div className="absolute top-0 bottom-0 w-px" style={{ background: C.primary, opacity: 0.85 }} />
                  <div className="absolute -left-[3px] top-0 h-[6px] w-[6px] rotate-45 rounded-[1px]" style={{ background: C.primary }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Icons (player's outline style) ───────────────────────────────────────────
const ico = 'h-[1.15em] w-[1.15em]';
const sw = 1.5;
const S = (props: { d: string; className?: string }) => (
  <svg className={props.className ?? ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}>
    <path strokeLinecap="round" strokeLinejoin="round" d={props.d} />
  </svg>
);

const PlayIcon = () => (
  <S d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
);
const PrevIcon = () => (
  <S d="M21 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061A1.125 1.125 0 0 1 21 8.689v8.122ZM11.25 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061a1.125 1.125 0 0 1 1.683.977v8.122Z" />
);
const NextIcon = () => (
  <S d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061A1.125 1.125 0 0 1 3 16.811V8.69ZM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061a1.125 1.125 0 0 1-1.683-.977V8.69Z" />
);
const MuteIcon = () => (
  <S d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
);
const CameraIcon = () => (
  <svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
  </svg>
);
const LoopIcon = () => (
  <svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} style={{ color: C.primary }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m17 2 4 4-4 4" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 13v1a4 4 0 0 1-4 4H3" />
  </svg>
);
const ChevronIcon = () => <S d="m19.5 8.25-7.5 7.5-7.5-7.5" />;
const LayoutIcon = () => (
  <svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}>
    <rect x="3.75" y="3.75" width="16.5" height="10.5" rx="1.5" />
    <path strokeLinecap="round" d="M3.75 18.75h16.5" />
  </svg>
);
const MinusIcon = () => <S className="h-[0.9em] w-[0.9em]" d="M5 12h14" />;
const PlusIcon = () => <S className="h-[0.9em] w-[0.9em]" d="M12 5v14M5 12h14" />;
