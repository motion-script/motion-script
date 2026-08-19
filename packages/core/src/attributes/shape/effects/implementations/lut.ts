import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * A 3D colour lookup table — the `.cube` a colourist hands you.
 *
 * The one adjustment in the roster that is not a formula. Everything else here
 * says what to *do* to a colour; a LUT is a measured cube of what each colour
 * should *become*, which is how film-stock and print emulations are shipped and
 * why no combination of curves and matrices substitutes for one. Applying it is
 * a trilinear lookup per pixel.
 *
 * A scene effect rather than a media-only adjustment, deliberately: everything
 * outside {@link NonFilterEffect} is automatically an `EffectAdjustment` too, so
 * one implementation grades an image fill's own pixels *and* a whole node —
 * which is what lets a graded photo and the graded titles over it be the same
 * look rather than two things kept in step by hand.
 *
 * ## The table
 *
 * Flat RGB triples, **red-fastest** — index `((b · size) + g) · size + r`, times
 * three — which is the order a `.cube` file writes its lines in, so a parser
 * fills this with no transposition to get wrong.
 *
 * It is a `Float32Array` and it is treated as **immutable and shared**: `equals`
 * compares it by reference and `lerp` hard-cuts it, exactly as `texture` does
 * with its `src`. That is not laziness. A 33³ cube is 107,811 floats; comparing
 * it per frame would cost more than the draw, interpolating it would allocate a
 * second cube per frame, and the renderer's GPU upload is cached against this
 * very identity. Hand the same array back each frame and a LUT costs one texture
 * upload for the life of the scene; build a fresh one per frame and it costs one
 * per frame.
 *
 * Cross-fading two *different* LUTs is therefore a cut, not a blend. That is the
 * honest answer — there is no meaningful midpoint between two measured cubes —
 * and the way to dissolve between looks is two fills, or {@link amount}.
 */
export interface LutEffect extends ModedEffect {
    type: "lut";
    /** The cube, flat RGB triples, red-fastest. Immutable and shared; see above. */
    table: Float32Array;
    /** Entries per axis. `table.length` must be `size³ × 3`. */
    size: number;
    /** 0–1 mix against the ungraded colour. 0 is a no-op, 1 is the full look. */
    amount: number;
}

export const lutEffect: EffectData<LutEffect> = {
    lerp: (from, to, t) => ({
        type: "lut",
        // The cube and its size travel together — a table read at the wrong
        // stride is not a wrong colour, it is garbage — so they cut together.
        table: t < 0.5 ? from.table : to.table,
        size: t < 0.5 ? from.size : to.size,
        amount: lerpNumber(from.amount, to.amount, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.table === b.table &&
        a.size === b.size &&
        a.amount === b.amount &&
        a.mode === b.mode,
    // It samples a second texture at a coordinate derived from the source's own
    // colour, so it needs the source as a shader it can read — not a colour
    // matrix it can compose.
    surface: "shader",
};
