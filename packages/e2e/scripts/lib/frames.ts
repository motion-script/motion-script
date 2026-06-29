/**
 * The three frames the e2e harness captures for every scene, and how to resolve
 * them against a scene's total frame count.
 *
 * TESTS.md calls for the "first, mid, and last frame of each scene". We address
 * them by index so the capture is deterministic and independent of the CLI's
 * `first`/`last` shorthand:
 *   - first → frame 0
 *   - mid   → floor((total - 1) / 2)
 *   - last  → total - 1
 *
 * `total` is the scene's frame count, learned from the driver's first capture
 * (it returns `totalFrames`). All e2e scenes are authored to a fixed 2s / 30fps
 * runtime (~60 frames; see src/scenes/_lib.tsx), but resolving against the real
 * `totalFrames` keeps mid/last correct even if a scene's length drifts.
 */
export type FrameLabel = 'first' | 'mid' | 'last';

export const FRAME_LABELS: readonly FrameLabel[] = ['first', 'mid', 'last'] as const;

/** Resolve the three frame labels to concrete 0-based frame indices for a `total`-frame scene. */
export function resolveFrames(total: number): Record<FrameLabel, number> {
    const last = Math.max(0, total - 1);
    return {
        first: 0,
        mid: Math.floor(last / 2),
        last,
    };
}
