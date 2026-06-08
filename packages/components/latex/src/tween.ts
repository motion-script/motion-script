
import { EaseFunction, FrameGenerator, lerpNumber, tween } from "@motion-script/core";
import { LatexToken } from "./geometry";

export interface AnimatedToken {
    token: string;
    path: LatexToken["path"];
    /** 0 = invisible, 1 = fully visible */
    opacity: number;
    /** Interpolated position offset applied during morph (x, y in formula space). */
    x: number;
    y: number;
}

/**
 * Compute the centroid of a token's path for position-based interpolation.
 */
function centroid(path: LatexToken["path"]): { x: number; y: number } {
    let sx = 0, sy = 0, n = 0;
    for (const cmd of path) {
        if ("x" in cmd && "y" in cmd) {
            sx += (cmd as any).x;
            sy += (cmd as any).y;
            n++;
        }
    }
    return n > 0 ? { x: sx / n, y: sy / n } : { x: 0, y: 0 };
}

/**
 * Greedily match tokens from `from` to `to` by character key.
 * Returns three lists: matched pairs, deleted tokens (only in from), added tokens (only in to).
 */
function matchTokens(
    from: LatexToken[],
    to: LatexToken[],
): {
    matched: Array<{ from: LatexToken; to: LatexToken }>;
    deleted: LatexToken[];
    added: LatexToken[];
} {
    const remaining = [...to];
    const matched: Array<{ from: LatexToken; to: LatexToken }> = [];
    const deleted: LatexToken[] = [];

    for (const ft of from) {
        // Skip synthetic shapes (rects/paths) — they don't have a natural token key
        if (ft.token.startsWith('__')) {
            deleted.push(ft);
            continue;
        }
        const idx = remaining.findIndex(t => t.token === ft.token && !t.token.startsWith('__'));
        if (idx !== -1) {
            matched.push({ from: ft, to: remaining[idx] });
            remaining.splice(idx, 1);
        } else {
            deleted.push(ft);
        }
    }

    // Remaining to-tokens that weren't matched
    const added = remaining;

    return { matched, deleted, added };
}

/**
 * Generator that animates a formula change by:
 * - Fading out deleted tokens in the first half of the duration.
 * - Moving matched tokens across the full duration.
 * - Fading in added tokens in the second half of the duration.
 *
 * `onFrame` is called each frame with the current list of AnimatedTokens to render.
 */
export function* tweenLatex(
    from: LatexToken[],
    to: LatexToken[],
    duration: number,
    onFrame: (tokens: AnimatedToken[]) => void,
    easing?: EaseFunction,
): FrameGenerator {
    const { matched, deleted, added } = matchTokens(from, to);

    // Pre-compute centroids for position lerp
    const matchedData = matched.map(({ from: f, to: t }) => ({
        fromPath: f.path,
        toPath: t.path,
        token: t.token,
        fromCenter: centroid(f.path),
        toCenter: centroid(t.path),
    }));

    yield* tween(duration, (rawT) => {
        const t = easing ? easing(rawT) : rawT;

        const tokens: AnimatedToken[] = [];

        // Matched tokens: slide across full duration
        for (const m of matchedData) {
            const dx = lerpNumber(m.fromCenter.x, m.toCenter.x, t);
            const dy = lerpNumber(m.fromCenter.y, m.toCenter.y, t);
            tokens.push({
                token: m.token,
                path: m.toPath,
                opacity: 1,
                x: dx - m.toCenter.x,
                y: dy - m.toCenter.y,
            });
        }

        // Deleted tokens: fade out over the first half, gone by t=0.5
        for (const d of deleted) {
            const fadeT = Math.min(t * 2, 1);
            tokens.push({
                token: d.token,
                path: d.path,
                opacity: lerpNumber(1, 0, fadeT),
                x: 0,
                y: 0,
            });
        }

        // Added tokens: fade in over the second half, starting at t=0.5
        for (const a of added) {
            const fadeT = Math.max(t * 2 - 1, 0);
            tokens.push({
                token: a.token,
                path: a.path,
                opacity: lerpNumber(0, 1, fadeT),
                x: 0,
                y: 0,
            });
        }

        onFrame(tokens);
    });
}
