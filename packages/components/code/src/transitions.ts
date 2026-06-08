import { IdLine } from "./tokens";

// A single animated token entry owned by one transition. Keyed by stable token
// id rather than (line, tokenIndex) so concurrent animations don't clobber each
// other when one shifts the indices of tokens the other is animating.
//
// `widthScale` multiplies the token's measured advance width in BOTH `measure()`
// and `drawSelf()`. A token at widthScale=0 takes zero horizontal space, so its
// neighbors to the right shift into its place.
export interface AnimToken {
    id: number;
    opacity: number[];
    opacityKeys: number[];
    offsetY: number[];
    offsetYKeys: number[];
    widthScale: number[];
    widthScaleKeys: number[];
}

// A transition is a self-contained animation unit. It owns its AnimTokens and a
// progress value [0..1] that the animation tween writes each frame.
export interface Transition {
    tokens: AnimToken[];
    lineHeightScales: Map<number, { values: number[]; keys: number[] }>;
    progress: number;
    introducedIds: Set<number>;
}

export interface TokenState {
    opacity: number;
    offsetY: number;
    widthScale: number;
}

/** Sample a piecewise-linear curve (keys → values) at progress `p` in [0, 1]. */
export function sampleCurve(keys: number[], values: number[], p: number): number {
    if (p <= keys[0]) return values[0];
    if (p >= keys[keys.length - 1]) return values[values.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
        if (p <= keys[i + 1]) {
            const span = keys[i + 1] - keys[i];
            const local = span === 0 ? 0 : (p - keys[i]) / span;
            return values[i] + (values[i + 1] - values[i]) * local;
        }
    }
    return values[values.length - 1];
}

export function makeAnim(
    id: number,
    curves: {
        opacity?: { keys: number[]; values: number[] };
        offsetY?: { keys: number[]; values: number[] };
        widthScale?: { keys: number[]; values: number[] };
    },
): AnimToken {
    const op = curves.opacity ?? { keys: [0, 1], values: [1, 1] };
    const oy = curves.offsetY ?? { keys: [0, 1], values: [0, 0] };
    const ws = curves.widthScale ?? { keys: [0, 1], values: [1, 1] };
    return {
        id,
        opacity: op.values,
        opacityKeys: op.keys,
        offsetY: oy.values,
        offsetYKeys: oy.keys,
        widthScale: ws.values,
        widthScaleKeys: ws.keys,
    };
}

/**
 * Resolve the per-token visual state (opacity/offsetY/widthScale) for the
 * current frame from the persistent highlight dim plus every active transition.
 * Overlapping transitions stack multiplicatively on widthScale.
 */
export function resolveTokenStates(
    tokenLines: IdLine[],
    transitions: Transition[],
    highlightDimOpacity: number | null,
    highlightedIds: Set<number>,
): Map<number, TokenState> {
    const out = new Map<number, TokenState>();

    if (highlightDimOpacity !== null) {
        const dim = highlightDimOpacity;
        for (const line of tokenLines) {
            for (const tok of line.tokens) {
                const isHighlighted = highlightedIds.has(tok.id);
                out.set(tok.id, { opacity: isHighlighted ? 1 : dim, offsetY: 0, widthScale: 1 });
            }
        }
    }

    for (const tr of transitions) {
        const t = tr.progress;
        for (const at of tr.tokens) {
            const op = sampleCurve(at.opacityKeys, at.opacity, t);
            const oy = sampleCurve(at.offsetYKeys, at.offsetY, t);
            const ws = sampleCurve(at.widthScaleKeys, at.widthScale, t);
            const prev = out.get(at.id);
            out.set(at.id, {
                opacity: op,
                offsetY: oy,
                widthScale: prev ? prev.widthScale * ws : ws,
            });
        }
    }

    return out;
}

/**
 * Resolve the per-line height scale for the current frame from every active
 * transition. Overlapping line-height animations stack multiplicatively.
 */
export function resolveLineHeightScales(transitions: Transition[]): Map<number, number> {
    const out = new Map<number, number>();
    for (const tr of transitions) {
        const t = tr.progress;
        for (const [lineId, curve] of tr.lineHeightScales) {
            const v = sampleCurve(curve.keys, curve.values, t);
            out.set(lineId, (out.get(lineId) ?? 1) * v);
        }
    }
    return out;
}
