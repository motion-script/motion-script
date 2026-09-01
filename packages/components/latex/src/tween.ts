import { lerpNumber, type PathCommand } from "@motion-script/core";
import type { LatexToken } from "./geometry";

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
 * How a `Latex` node interpolates between two formulas: given the tokens it
 * currently holds and the tokens the target formula resolves to, return a
 * pure `t → AnimatedToken[]` frame function. `prepareLatexTween` below is the
 * default implementation (exported as `defaultLatexMorph`) — pass a `morph`
 * of this shape to `<Latex>` to replace it with your own.
 */
export type LatexMorphStrategy = (from: LatexToken[], to: LatexToken[]) => (t: number) => AnimatedToken[];

/** The coordinate pairs a `PathCommand` can carry, as (x, y) field names. */
const POINT_FIELDS = [["x", "y"], ["x1", "y1"], ["x2", "y2"]] as const;

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
 * A glyph's on-screen extent, as the diagonal of its control-point bbox.
 *
 * Only ever used as a *ratio* between the two ends of a match, so the fact that
 * control points overshoot the true outline doesn't matter: both ends overshoot
 * by the same proportion, because they are the same outline.
 */
function extent(path: LatexToken["path"]): number {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cmd of path) {
        const c = cmd as any;
        for (const [kx, ky] of POINT_FIELDS) {
            if (kx in c) {
                if (c[kx] < minX) minX = c[kx];
                if (c[kx] > maxX) maxX = c[kx];
                if (c[ky] < minY) minY = c[ky];
                if (c[ky] > maxY) maxY = c[ky];
            }
        }
    }
    if (minX > maxX) return 0;
    return Math.hypot(maxX - minX, maxY - minY);
}

/**
 * Whether two paths can be interpolated point by point: same command count,
 * same command types in the same order.
 *
 * For a matched pair this is the overwhelmingly common case, and not by luck.
 * Tokens are matched on the character their MathJax glyph id decodes to, and
 * that id *is* the key into the `<defs>` dictionary — so the same character in
 * two formulas is the same outline, emitted twice under two different
 * transforms. Same commands, different numbers.
 */
function isPointwiseCompatible(from: PathCommand[], to: PathCommand[]): boolean {
    if (from.length !== to.length) return false;
    for (let i = 0; i < from.length; i++) {
        if (from[i].type !== to[i].type) return false;
    }
    return true;
}

/**
 * Lerp two structurally identical paths point by point.
 *
 * When the two ends are the same outline under two affine transforms — which is
 * what a matched glyph is — this is exact at both ends *and* correct in
 * between: `(1-t)·A·q + t·B·q = ((1-t)A + tB)·q`, and a blend of two
 * uniform-scale-plus-translate transforms is another one. The intermediate is a
 * properly formed glyph at an intermediate size, not a smeared one.
 */
function lerpPath(from: PathCommand[], to: PathCommand[], t: number): PathCommand[] {
    const out: PathCommand[] = new Array(from.length);
    for (let i = 0; i < from.length; i++) {
        const f = from[i] as any;
        const g = to[i] as any;
        const c: any = { ...g };
        for (const [kx, ky] of POINT_FIELDS) {
            if (kx in g && kx in f) {
                c[kx] = lerpNumber(f[kx], g[kx], t);
                c[ky] = lerpNumber(f[ky], g[ky], t);
            }
        }
        out[i] = c as PathCommand;
    }
    return out;
}

/**
 * Scale a path uniformly about (cx, cy), then translate by (dx, dy).
 *
 * The fallback for a matched pair whose paths *aren't* structurally identical —
 * a stretchy delimiter assembled from a different number of pieces at the two
 * sizes, say. Point-by-point lerping is impossible there, so the target outline
 * is shrunk to the source's size instead and grown back over the morph: the
 * size still changes continuously, which is the whole point, at the cost of
 * showing the target's shape from the start.
 */
function scaleAbout(
    path: PathCommand[],
    cx: number,
    cy: number,
    s: number,
    dx: number,
    dy: number,
): PathCommand[] {
    return path.map(cmd => {
        const c: any = { ...(cmd as any) };
        for (const [kx, ky] of POINT_FIELDS) {
            if (kx in c) {
                c[kx] = cx + (c[kx] - cx) * s + dx;
                c[ky] = cy + (c[ky] - cy) * s + dy;
            }
        }
        return c as PathCommand;
    });
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
        if (ft.token.startsWith("__")) {
            deleted.push(ft);
            continue;
        }
        const idx = remaining.findIndex(t => t.token === ft.token && !t.token.startsWith("__"));
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
 * Precompute a formula-change morph and return a pure `t → AnimatedToken[]`
 * frame function:
 * - Deleted tokens fade out over the first half of `t`.
 * - Matched tokens are interpolated — place *and* size — across the full range
 *   of `t`.
 * - Added tokens fade in over the second half of `t`.
 *
 * A matched glyph is rarely the same size at both ends: the `2` of `b^2` is set
 * at script size and the `2` of `2a` at full size, and a `\frac`'s arguments
 * come back a step smaller than the same symbols on a baseline. So the
 * interpolation has to carry the glyph's *geometry*, not just where it sits.
 * Sliding the target outline from one centroid to the other — which is all this
 * used to do — put the whole size change between the last static frame and the
 * morph's first one: a snap to the new size, then a smooth glide to the new
 * place. Point-by-point lerping (see {@link lerpPath}) is that same
 * interpolation generalised from a glyph's average point to all of them, and it
 * costs nothing extra — the path was already being rebuilt every frame to apply
 * the slide.
 *
 * `t` is normalized `[0, 1]` and already eased — the caller (a `Command`'s
 * `at`) applies easing once, up front, the same eased value driving every
 * concurrent aspect of the morph (props, intrinsic size, tokens) in lockstep.
 */
export function prepareLatexTween(
    from: LatexToken[],
    to: LatexToken[],
): (t: number) => AnimatedToken[] {
    const { matched, deleted, added } = matchTokens(from, to);

    // Per-match interpolation data. Structure compatibility, and the centroids
    // and extents behind the fallback, are properties of the pair rather than
    // of `t`, so they are settled once here instead of at every frame.
    const matchedData = matched.map(({ from: f, to: t }) => {
        const toExtent = extent(t.path);
        return {
            pointwise: isPointwiseCompatible(f.path, t.path),
            fromPath: f.path,
            toPath: t.path,
            token: t.token,
            fromCenter: centroid(f.path),
            toCenter: centroid(t.path),
            /** Only the fallback needs it, and only as a ratio. */
            fromScale: toExtent > 0 ? extent(f.path) / toExtent : 1,
        };
    });

    return (t: number): AnimatedToken[] => {
        const tokens: AnimatedToken[] = [];

        // Matched tokens: interpolate place and size across the full duration.
        for (const m of matchedData) {
            if (m.pointwise) {
                tokens.push({
                    token: m.token,
                    path: lerpPath(m.fromPath, m.toPath, t),
                    opacity: 1,
                    // Baked into the path above: the lerp carries every point,
                    // which includes where the glyph sits.
                    x: 0,
                    y: 0,
                });
                continue;
            }

            const s = lerpNumber(m.fromScale, 1, t);
            const cx = lerpNumber(m.fromCenter.x, m.toCenter.x, t);
            const cy = lerpNumber(m.fromCenter.y, m.toCenter.y, t);
            tokens.push({
                token: m.token,
                path: scaleAbout(
                    m.toPath,
                    m.toCenter.x,
                    m.toCenter.y,
                    s,
                    cx - m.toCenter.x,
                    cy - m.toCenter.y,
                ),
                opacity: 1,
                x: 0,
                y: 0,
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

        return tokens;
    };
}
