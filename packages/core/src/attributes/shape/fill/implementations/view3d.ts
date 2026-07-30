import type { BlendMode } from '../blend';
import type { FillData } from '../registry';
import type { Graphics3D } from '@/render3d/graphics3d';
import { track3DResources } from '@/render3d/tracking';

/**
 * A 3D scene, painted as a fill.
 *
 * 3D is paint, not structure: the renderer draws the scene to a texture and
 * shades the shape's own path with it. So it clips to whatever painted it — an
 * `Ellipse`, a `Path`, a run of `Text` — stacks with the other fills in the
 * array, and inherits the fill layer's `opacity`/`blend`/`space` like any other.
 *
 *   <Ellipse fill={Fills.view3D(g3)} />
 *   <Rect fill={["#0b0d12", g3, Fills.linearGradient(["transparent", "#000/60"])]} />
 *
 * The payload is a **built** {@link Graphics3D}, never a builder callback. Per-frame
 * freshness comes from where the value is produced — a `renderSelf` runs every
 * frame, and a `() => …` prop is an ordinary reactive binding — which is exactly
 * how every other fill behaves.
 */
export interface View3DFillProp {
    type: 'view3D';
    /** The scene to draw. Rebuilt by its producer each frame; never a callback. */
    graphics3D: Graphics3D;
    /**
     * Ceiling on the 3D buffer's device-pixel ratio. Default 2.
     *
     * Exists so a high-scale export doesn't allocate a quadratically larger
     * render buffer than the scene needs — a 4× export of a 1080p shape would
     * otherwise ask for a 16× buffer.
     */
    maxPixelRatio?: number;
    /** Multisample the 3D pass. Default true. */
    antialias?: boolean;
    opacity?: number;
    blend?: BlendMode;
}

export interface View3DFillResolved {
    type: 'view3D';
    graphics3D: Graphics3D;
    maxPixelRatio?: number;
    antialias?: boolean;
    opacity?: number;
    blend?: BlendMode;
}

export const view3DFill: FillData<View3DFillResolved> = {
    // Nothing to normalise — the defaults for maxPixelRatio/antialias are applied
    // at render time so the resolved shape stays minimal and comparable.
    resolve: (prop: View3DFillProp) => ({ ...prop }),

    // A scene is a command list: there is no meaningful value halfway between two
    // of them, so it snaps, exactly as an image fill's `src` does. Only `opacity`
    // interpolates. Deliberately returns neither `type` nor `blend` — `FillResult`
    // omits both and `lerpFill` reassembles via `{ ...a, ...lerp(...) }`, which is
    // also what makes the ragged-array self-pair (a fill fading against a copy of
    // itself, when the two fill arrays differ in length) work.
    lerp: (a, b, t) => ({
        graphics3D: t < 0.5 ? a.graphics3D : b.graphics3D,
        maxPixelRatio: a.maxPixelRatio ?? b.maxPixelRatio,
        antialias: a.antialias ?? b.antialias,
        opacity: (a.opacity ?? 1) + ((b.opacity ?? 1) - (a.opacity ?? 1)) * t,
    }),

    // Reference identity is the only comparison a Graphics3D supports — it has no
    // structural hash and `ops()` returns its live array. Nothing in the codebase
    // calls this today; it exists to satisfy the interface.
    equals: (a, b) => a.graphics3D === b.graphics3D,

    // The precomp seam. Runs off the same descriptors the renderer consumes, so
    // what gets loaded cannot drift from what gets drawn.
    //
    // `width`/`height` come from the last shape op the tracking context saw, so a
    // 3D fill on a raw `path`/`line` reports 0×0 — the same pre-existing caveat
    // every fill has there.
    prepare: (fill, tracker, width, height) => {
        track3DResources(fill.graphics3D, tracker, width, height);
    },
};
