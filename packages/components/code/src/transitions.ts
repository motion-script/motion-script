import type { CodeLayout } from "./layout";
import { IdLine } from "./tokens";

// A single animated token entry owned by one dim transition. Keyed by stable
// token id rather than (line, tokenIndex) so concurrent animations don't clobber
// each other when one shifts the indices of tokens the other is animating.
export interface AnimToken {
    id: number;
    opacity: number[];
    opacityKeys: number[];
}

/**
 * A highlight cross-fade: opacity, and nothing else.
 *
 * Structure is untouched, so several of these stack happily and a listing held
 * under a highlight still hits the static-layout cache.
 */
export interface DimTransition {
    kind: "dim";
    tokens: AnimToken[];
    progress: number;
}

/** Where a wholly new row comes in from. */
export type EntryDirection = "up" | "down" | "right";

/**
 * When each part of a structural edit happens, in normalized transition time.
 *
 * The order is what an edit *looks like* being made: what is going away leaves
 * first, what stays reflows into its new place, and only then does what is new
 * appear. Running them together is what made a replacement look like a
 * cross-dissolve of two unrelated listings.
 */
export interface Phases {
    /** Removed tokens fade out. Null when the edit removes nothing. */
    out: [number, number] | null;
    /** Surviving tokens travel, and the block resizes. Always present. */
    move: [number, number];
    /** Added tokens fade (and slide) in. Null when the edit adds nothing. */
    in: [number, number] | null;
}

/**
 * One edit in flight: the structure before, the structure after, and who is
 * doing what.
 *
 * Both endpoints are fixed for the transition's whole life, which is why the
 * two resolved layouts hang off it — they are computed once and reused for
 * every frame the edit spans, rather than rebuilt per frame from a structure
 * that is being mutated underneath.
 */
export interface StructuralTransition {
    kind: "structural";
    from: IdLine[];
    to: IdLine[];
    removedIds: Set<number>;
    addedIds: Set<number>;
    /** Line id (in `to`) → the direction that whole row enters from. */
    entryByLine: Map<number, EntryDirection>;
    fromColorById: Map<number, string | undefined>;
    phases: Phases;
    progress: number;
    /** @internal Layout cache — see {@link StructuralTransition}. */
    layoutKey: string | null;
    fromLayout: CodeLayout | null;
    toLayout: CodeLayout | null;
}

export type CodeTransition = DimTransition | StructuralTransition;

/**
 * Decides *when* (in normalized transition time) each part of a structural
 * edit happens, given only whether the edit removes/adds anything.
 * `phasesFor` below is the default implementation (exported as
 * `defaultCodePhases`) — pass a `phaseStrategy` of this shape to `<Code>` to
 * replace it with your own timing.
 */
export type CodePhaseStrategy = (hasRemoved: boolean, hasAdded: boolean) => Phases;

export interface TokenState {
    opacity: number;
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

/** Progress *within* a phase window, clamped to [0, 1]. A null window is complete. */
export function windowProgress(w: [number, number] | null, p: number): number {
    if (!w) return 1;
    const [a, b] = w;
    if (p <= a) return 0;
    if (p >= b) return 1;
    return b === a ? 1 : (p - a) / (b - a);
}

/** Smooth start and end, so a phase never begins or ends with a velocity step. */
export function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
}

/** Decelerating — what a row entering the frame should do. */
export function easeOutCubic(t: number): number {
    const inv = 1 - t;
    return 1 - inv * inv * inv;
}

export function makeAnim(id: number, curve: { keys: number[]; values: number[] }): AnimToken {
    return { id, opacity: curve.values, opacityKeys: curve.keys };
}

/**
 * The phase schedule for an edit, shaped by what the edit actually contains.
 *
 * A fixed schedule wastes time it does not need: a pure append has nothing to
 * fade out, so holding the first 40% of the duration empty just makes the
 * animation feel late. Each shape gets the whole duration spent on the parts
 * that exist, with adjacent phases overlapping enough to read as one movement.
 */
export function phasesFor(hasRemoved: boolean, hasAdded: boolean): Phases {
    // The overlaps are deliberate and small. Butt-joining the phases leaves the
    // block sitting empty at its new size for a beat between the old content
    // leaving and the new content arriving; letting the arrival start while the
    // reflow's eased tail is still running closes that gap without blurring the
    // order the edit reads in.
    if (hasRemoved && hasAdded) return { out: [0, 0.38], move: [0.10, 0.68], in: [0.52, 1] };
    if (hasRemoved) return { out: [0, 0.45], move: [0.22, 1], in: null };
    if (hasAdded) return { out: null, move: [0, 0.55], in: [0.38, 1] };
    return { out: null, move: [0, 1], in: null };
}

/** {@link phasesFor} under the name a `phaseStrategy` default is looked up by. */
export const defaultCodePhases: CodePhaseStrategy = phasesFor;

/** How far through the "everything reflows" phase a frame is, eased. A settled frame (no edit) is always fully moved. */
export function moveProgress(edit: { phases: Phases; progress: number } | null): number {
    return edit ? smoothstep(windowProgress(edit.phases.move, edit.progress)) : 1;
}

/**
 * Resolve the per-token opacity multiplier for the current frame from the
 * persistent highlight dim plus every active dim transition.
 */
export function resolveTokenStates(
    tokenLines: IdLine[],
    transitions: CodeTransition[],
    highlightDimOpacity: number | null,
    highlightedIds: Set<number>,
): Map<number, TokenState> {
    const out = new Map<number, TokenState>();

    if (highlightDimOpacity !== null) {
        const dim = highlightDimOpacity;
        for (const line of tokenLines) {
            for (const tok of line.tokens) {
                out.set(tok.id, { opacity: highlightedIds.has(tok.id) ? 1 : dim });
            }
        }
    }

    for (const tr of transitions) {
        if (tr.kind !== "dim") continue;
        for (const at of tr.tokens) {
            out.set(at.id, { opacity: sampleCurve(at.opacityKeys, at.opacity, tr.progress) });
        }
    }

    return out;
}
