import React, { useRef } from 'react';

/**
 * A card wrapper for the landing-page showcase cards (features, procedural,
 * editor). The `.card-floor` class pools a faint light-gray circular shadow
 * under the card's center on hover so it reads as gently lifting off the page.
 *
 * The shadow lives on an outer wrapper (its `::after`) while the card classes
 * go on an inner element, so a card that clips its content with
 * `overflow-hidden` doesn't also clip the shadow that bleeds past its edge.
 *
 * With `tilt`, the inner card also leans very subtly toward the cursor (the
 * features section opts in; procedural/editor stay flat). Respects
 * `prefers-reduced-motion`.
 */

const TILT = 1.5; // degrees — intentionally tiny, just a hint of depth

export function CardShadow({
  children,
  style,
  className = '',
  tilt = false,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  tilt?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(1400px) rotateX(${-py * TILT * 2}deg) rotateY(${px * TILT * 2}deg)`;
  }

  function handleMouseLeave() {
    const el = ref.current;
    if (el) el.style.transform = 'perspective(1400px) rotateX(0deg) rotateY(0deg)';
  }

  if (!tilt) {
    return (
      <div className="card-floor h-full">
        <div style={style} className={className}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="card-floor h-full [perspective:1400px]">
      <div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={style}
        className={`will-change-transform transition-transform duration-300 ease-out motion-reduce:transition-none motion-reduce:transform-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Frames a feature demo (canvas/video). Adds an optional floating glass chip
 * pinned to the top-left and a thin inner ring so the demo reads as an inset
 * panel.
 */
export default function FeatureFrame({
  children,
  chip,
  className = '',
}: {
  children: React.ReactNode;
  /** Optional floating label pinned to the top-left of the demo. */
  chip?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {children}

      {/* Inner ring so the demo reads as an inset panel. */}
      <span
        className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] ring-1 ring-inset ring-white/10"
        aria-hidden
      />

      {chip ? (
        <div className="pointer-events-none absolute left-3 top-3 z-30 flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80 feature-chip">
          {chip}
        </div>
      ) : null}
    </div>
  );
}

/** A small pulsing-dot + label, the default chip content. */
export function LiveChip({ label }: { label: string }) {
  return (
    <>
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
      {label}
    </>
  );
}
