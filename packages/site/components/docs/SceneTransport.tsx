'use client'

// Playback controls for a SceneCanvas: play/pause, step back/forward, and a
// scrub slider spanning 0..loop seconds. Purely presentational — all state
// lives in SceneCanvas; this just renders and reports intent up.

function fmt(t: number) {
  return `${t.toFixed(1)}s`
}

const btn =
  'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'

export function SceneTransport({
  playing,
  time,
  loop,
  onPlayPause,
  onStepBack,
  onStepForward,
  onSeek,
}: {
  playing: boolean
  time: number
  loop: number
  onPlayPause: () => void
  onStepBack: () => void
  onStepForward: () => void
  onSeek: (t: number) => void
}) {
  const pct = loop > 0 ? (time / loop) * 100 : 0

  return (
    <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-3 py-2">
      <button onClick={onStepBack} className={btn} aria-label="Step backward" title="Step backward">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          aria-hidden
        >
          <line x1="7" y1="6" x2="7" y2="18" />
          <path d="M19 6.5v11a1 1 0 0 1-1.5.9L9 13a1 1 0 0 1 0-1.8l8.5-5.6a1 1 0 0 1 1.5.9z" />
        </svg>
      </button>

      <button
        onClick={onPlayPause}
        className={btn}
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <rect x="6" y="5" width="4" height="14" rx="1.6" />
            <rect x="14" y="5" width="4" height="14" rx="1.6" />
          </svg>
        ) : (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M8 6.5v11a1 1 0 0 0 1.5.9l9-5.5a1 1 0 0 0 0-1.8l-9-5.5a1 1 0 0 0-1.5.9z" />
          </svg>
        )}
      </button>

      <button onClick={onStepForward} className={btn} aria-label="Step forward" title="Step forward">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M5 6.5v11a1 1 0 0 0 1.5.9L15 13a1 1 0 0 0 0-1.8L6.5 5.6A1 1 0 0 0 5 6.5z" />
          <line x1="17" y1="6" x2="17" y2="18" />
        </svg>
      </button>

      <input
        type="range"
        min={0}
        max={loop}
        step={0.01}
        value={time}
        onChange={(e) => onSeek(parseFloat(e.target.value))}
        aria-label="Timeline"
        className="scene-scrub h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted"
        style={{
          background: `linear-gradient(to right, var(--primary, #6990DD) ${pct}%, color-mix(in srgb, currentColor 18%, transparent) ${pct}%)`,
        }}
      />

      <span className="w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {fmt(time)} / {fmt(loop)}
      </span>
    </div>
  )
}
