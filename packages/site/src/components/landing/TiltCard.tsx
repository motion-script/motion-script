import React, { useRef } from 'react';

/**
 * A card that tilts in 3D toward the cursor — the GitHub/cursor-style hover
 * effect. Tracks the pointer relative to the card center and applies a capped
 * `perspective + rotateX/rotateY` transform, easing back to flat on leave.
 * Respects `prefers-reduced-motion`.
 */

const MAX_TILT = 2.5; // degrees — subtle

export default function TiltCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Cursor position relative to the card's center, normalized to [-0.5, 0.5].
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    const rotateY = px * MAX_TILT * 2;
    const rotateX = -py * MAX_TILT * 2;
    el.style.transform = `perspective(1100px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.01)`;
  }

  function handleMouseLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(1100px) rotateX(0deg) rotateY(0deg) scale(1)';
  }

  return (
    <div className="relative [perspective:1100px]">
      <div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={`will-change-transform [transform-style:preserve-3d] transition-transform duration-300 ease-out motion-reduce:transition-none motion-reduce:transform-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
