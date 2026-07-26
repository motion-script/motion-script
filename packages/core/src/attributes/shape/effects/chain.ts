import { SceneEffect } from "./union";
import type { Vector2 } from "@/attributes/layout/vector2";
import type { BlendMode } from "../fill/blend";
import type { EffectAxis, EffectOptions } from "./effect-data";
import { scalarOptions, withEffectOptions } from "./effect-data";
import type { InvertChannel } from "./implementations/invert";
import type { MotionBlurAlignment } from "./implementations/motion-blur";
import type { SkSLUniform } from "./implementations/sksl";

/**
 * Every effect builder takes **exactly one argument**: an options object
 * carrying all of that effect's data. Builders with one dominant animated
 * scalar also accept that scalar directly, so the common case stays terse:
 *
 *     FX.blur(8)
 *     FX.blur({ radius: 8, mode: 'backdrop' })
 *
 * Field names are shared vocabulary across every effect — `radius` is always a
 * pixel distance, `amount` always a 0–1 intensity, `angle` always degrees,
 * `center` always a 0–1 normalised point, `axis` always an {@link EffectAxis}.
 */

/** Gaussian blur. Scalar shorthand sets `radius`. */
export interface BlurOptions extends EffectOptions {
    /** Blur spread in pixels. */
    radius: number;
}

/** Directional (linear) blur. Scalar shorthand sets `radius`. */
export interface DirectionalBlurOptions extends EffectOptions {
    /** Smear length in pixels along `angle`. */
    radius: number;
    /** Smear axis in degrees — 0 = horizontal, 90 = vertical (default 0). */
    angle?: number;
}

/** Desaturation. Scalar shorthand sets `amount`. */
export interface GrayscaleOptions extends EffectOptions {
    /** 0–1: 0 = original, 1 = fully desaturated. */
    amount: number;
}

/**
 * After Effects-style Mosaic. Scalar shorthand sets `blocks` on both axes.
 *
 * `blocks` is the *number of blocks* across the node, so a count equal to the
 * node's pixel size on that axis is pristine and lower counts are coarser.
 */
export interface PixelateOptions extends EffectOptions {
    /** Block count — a number for both axes, or per-axis via `{ x, y }`. */
    blocks: number | Vector2;
    /** AE "Sharp Colors": solid blocks (true, the default) vs. smoothly blended. */
    sharpColors?: boolean;
}

/** Bulge / pinch lens over the node's own content. Scalar shorthand sets `strength`. */
export interface BulgeOptions extends EffectOptions {
    /** Positive bulges (barrel), negative pinches (pincushion). Range ≈ −1…1. */
    strength: number;
    /** Lens centre in 0–1 layer coords (default middle). */
    center?: Vector2;
}

/** Magnifier lens over the backdrop. Scalar shorthand sets `scale`. */
export interface MagnifyOptions extends EffectOptions {
    /** Magnification factor — 1 = none, 2 = 2×, 0.5 = zoomed out (default 2). */
    scale?: number;
    /** Magnify centre in 0–1 layer coords (default middle). */
    center?: Vector2;
}

/** Bloom (glow). Scalar shorthand sets `intensity`. */
export interface BloomOptions extends EffectOptions {
    /** Additive multiplier for the bloom pass (default 1). */
    intensity?: number;
    /** 0–1 luminance cutoff — only pixels brighter than this bloom (default 0.7). */
    threshold?: number;
    /** Spread in pixels (default 12). */
    radius?: number;
}

/** Vintage / film-look colour grading. Scalar shorthand sets `amount`. */
export interface VintageOptions extends EffectOptions {
    /** 0–1: 0 = original, 1 = full sepia + desaturate (default 1). */
    amount?: number;
    /** −1…1: negative = cool/cyan tint, positive = warm/amber (default 0.2). */
    warmth?: number;
}

/** Lens-dispersion colour fringing. Scalar shorthand sets `amount`. */
export interface ChromaticAberrationOptions extends EffectOptions {
    /** Pixel offset distance for the R/B fringe (default 4). */
    amount?: number;
    /** Fringe axis in degrees — 0 = horizontal, R right / B left (default 0). */
    angle?: number;
}

/** Colour invert. Scalar shorthand sets `strength`. */
export interface InvertOptions extends EffectOptions {
    /** 0–1: blend from original (0) to fully inverted (1) (default 1). */
    strength?: number;
    /** Which channel / colour component to invert (default `'rgba'`). */
    channel?: InvertChannel;
}

/** Per-pixel random jitter. Scalar shorthand sets `strength`. */
export interface ScatterOptions extends EffectOptions {
    /** Maximum random pixel displacement (default 10). */
    strength?: number;
    /** Axis pixels are scattered along (default `'both'`). */
    axis?: EffectAxis;
}

/** Colour banding. Scalar shorthand sets `levels`. */
export interface PosterizeOptions extends EffectOptions {
    /** Number of brightness levels per channel (≥ 2, default 4). */
    levels?: number;
}

/** Velocity-driven motion blur. Scalar shorthand sets `length`. */
export interface MotionBlurOptions extends EffectOptions {
    /** Shutter "openness" as a percent; 100 ≈ 360° (default 50). */
    length?: number;
    /** Shutter phase: `'behind'` | `'centered'` | `'ahead'` | −1…1 (default `'centered'`). */
    alignment?: MotionBlurAlignment;
    /** Renderer quality hint; higher switches to multi-tap accumulation (default 16). */
    samples?: number;
    /** Blur-length multiplier (default 1). */
    strength?: number;
    /** Per-axis velocity scale (default `'both'`). */
    axis?: EffectAxis;
}

/**
 * Custom SkSL shader. `mode` selects the path:
 *
 * - `'foreground'` (the default) — the shader generates colour and is composited
 *   onto the node's layer with `blendMode`.
 * - `'backdrop'` — the shader receives `uniform shader u_backdrop` (a snapshot of
 *   what is painted beneath the node) and resamples it. `blendMode` is unused.
 */
export interface SkSLOptions extends EffectOptions {
    /** SkSL source. Uniforms declared after any built-ins are supplied via `uniforms`. */
    shader: string;
    /** Values in declaration order — lerped between animation frames (default `[]`). */
    uniforms?: SkSLUniform[];
    /** How a foreground shader composites onto the layer (default `'screen'`). */
    blendMode?: BlendMode;
}

const CENTER: Vector2 = { x: 0.5, y: 0.5 };

/** Normalise {@link PixelateOptions.blocks} to a per-axis count. */
const toBlocks = (blocks: number | Vector2): Vector2 =>
    typeof blocks === "number" ? { x: blocks, y: blocks } : blocks;

/**
 * Immutable, chainable list of scene effects.
 *
 * Each builder method returns a new `EffectChain` with the effect appended,
 * so chains are safe to share and branch.
 *
 * @example
 * const fx = FX.blur(4).grayscale(0.5);
 * node.effects = fx; // assign directly
 * node.effects = [...fx, { type: 'pixelate', ... }]; // spread into array
 */
export class EffectChain {
    constructor(public list: SceneEffect[] = []) { }

    private append(effect: SceneEffect): EffectChain {
        return new EffectChain([...this.list, effect]);
    }

    /**
     * Append a Gaussian blur. Pass `{ mode: "backdrop" }` to blur the content
     * beneath the node (clipped to its silhouette, Figma-style) instead of the
     * node's own content.
     */
    blur(options: number | BlurOptions) {
        const o = scalarOptions(options, "radius");
        return this.append(withEffectOptions({ type: "blur" as const, radius: o.radius ?? 0 }, o));
    }

    /**
     * Append a motion-blur-style directional (linear) blur, smearing the node's
     * own content along a single axis (or the backdrop, with `{ mode: "backdrop" }`).
     */
    directionalBlur(options: number | DirectionalBlurOptions) {
        const o = scalarOptions(options, "radius");
        return this.append(withEffectOptions(
            { type: "directionalBlur" as const, radius: o.radius ?? 0, angle: o.angle ?? 0 },
            o,
        ));
    }

    /**
     * Append an After Effects-style Mosaic / pixelate. `blocks` is the *number of
     * blocks* across the node (a count equal to the node's pixel size on that
     * axis is pristine; lower is coarser), not a pixel block size.
     */
    pixelate(options: number | PixelateOptions) {
        const o = scalarOptions(options, "blocks");
        return this.append(withEffectOptions(
            {
                type: "pixelate" as const,
                blocks: toBlocks(o.blocks ?? 1),
                sharpColors: o.sharpColors ?? true,
            },
            o,
        ));
    }

    /** Append a grayscale effect. `{ mode: "backdrop" }` desaturates the backdrop. */
    grayscale(options: number | GrayscaleOptions) {
        const o = scalarOptions(options, "amount");
        return this.append(withEffectOptions({ type: "grayscale" as const, amount: o.amount ?? 0 }, o));
    }

    /**
     * Append a bulge/pinch lens applied to the node's *own* content (like blur),
     * not the backdrop. A barrel distortion magnifies the centre and pins the
     * edges; a negative strength pinches the centre inward instead.
     */
    bulge(options: number | BulgeOptions) {
        const o = scalarOptions(options, "strength");
        return this.append(withEffectOptions(
            { type: "bulge" as const, strength: o.strength ?? 0, center: o.center ?? CENTER },
            o,
        ));
    }

    /**
     * Append a magnify lens that magnifies the backdrop beneath the node. The lens
     * fills the node's bounding box and is clipped to its silhouette, so whatever
     * is painted underneath shows through scaled about `center` — like a
     * magnifying glass shaped to the node.
     *
     * Defaults to `{ mode: 'backdrop' }`; pass `mode` explicitly to override.
     */
    magnify(options?: number | MagnifyOptions) {
        const o = scalarOptions(options, "scale");
        return this.append(withEffectOptions(
            { type: "magnify" as const, scale: o.scale ?? 2, center: o.center ?? CENTER },
            { mode: o.mode ?? "backdrop" },
        ));
    }

    /**
     * Append a bloom (glow) effect. Bright areas bleed soft light outward via a
     * screen-blend of the blurred bright-pass onto the layer.
     */
    bloom(options?: number | BloomOptions) {
        const o = scalarOptions(options, "intensity");
        return this.append(withEffectOptions(
            {
                type: "bloom" as const,
                threshold: o.threshold ?? 0.7,
                radius: o.radius ?? 12,
                intensity: o.intensity ?? 1,
            },
            o,
        ));
    }

    /** Append a vintage / film-look colour grading effect. */
    vintage(options?: number | VintageOptions) {
        const o = scalarOptions(options, "amount");
        return this.append(withEffectOptions(
            { type: "vintage" as const, amount: o.amount ?? 1, warmth: o.warmth ?? 0.2 },
            o,
        ));
    }

    /**
     * Append a chromatic aberration effect — red/blue colour fringing that mimics
     * lens dispersion.
     */
    chromaticAberration(options?: number | ChromaticAberrationOptions) {
        const o = scalarOptions(options, "amount");
        return this.append(withEffectOptions(
            { type: "chromaticAberration" as const, amount: o.amount ?? 4, angle: o.angle ?? 0 },
            o,
        ));
    }

    /** Append a colour-invert effect. */
    invert(options?: number | InvertOptions) {
        const o = scalarOptions(options, "strength");
        return this.append(withEffectOptions(
            { type: "invert" as const, channel: o.channel ?? "rgba", strength: o.strength ?? 1 },
            o,
        ));
    }

    /**
     * Append a scatter effect — randomly jitters the node's own pixels, smearing
     * its content like After Effects' Scatter.
     */
    scatter(options?: number | ScatterOptions) {
        const o = scalarOptions(options, "strength");
        return this.append(withEffectOptions(
            { type: "scatter" as const, strength: o.strength ?? 10, axis: o.axis ?? "both" },
            o,
        ));
    }

    /**
     * Append an After Effects-style posterize effect — quantizes each colour
     * channel into `levels` evenly-spaced bands, flattening gradients into steps.
     */
    posterize(options?: number | PosterizeOptions) {
        const o = scalarOptions(options, "levels");
        return this.append(withEffectOptions({ type: "posterize" as const, levels: o.levels ?? 4 }, o));
    }

    /**
     * Append velocity-driven motion blur — smears the node's own content along its
     * actual per-frame motion (a static node stays sharp). Modelled on After
     * Effects' shutter angle (`length`) and shutter phase (`alignment`).
     */
    motionBlur(options?: number | MotionBlurOptions) {
        const o = scalarOptions(options, "length");
        return this.append(withEffectOptions(
            {
                type: "motionBlur" as const,
                length: o.length ?? 50,
                alignment: o.alignment ?? "centered",
                samples: o.samples ?? 16,
                strength: o.strength ?? 1,
                axis: o.axis ?? "both",
            },
            o,
        ));
    }

    /**
     * Append a custom SkSL shader. `mode` picks the layer it runs on — a
     * foreground overlay blended with `blendMode`, or a backdrop shader that
     * resamples `uniform shader u_backdrop`.
     */
    sksl(options: SkSLOptions) {
        const mode = options.mode ?? "foreground";
        const base = { type: "sksl" as const, shader: options.shader, uniforms: options.uniforms ?? [] };
        // blendMode only applies to the foreground overlay; leaving it undefined
        // for a backdrop shader keeps `equals()` comparing like with like.
        const effect: SceneEffect = mode === "foreground"
            ? { ...base, blendMode: options.blendMode ?? "screen" }
            : base;
        return this.append(withEffectOptions(effect, { mode }));
    }

    /** Allows spreading the chain into an array: `[...FX.blur(5)]`. */
    *[Symbol.iterator]() {
        yield* this.list;
    }

    /** Serializes to the raw effect array so frameworks that call `toJSON` get a plain value. */
    toJSON() {
        return this.list;
    }
}

/**
 * Accepted shapes for a node's `effects` prop.
 *
 * Mirrors {@link Fill}: a single {@link SceneEffect}, an `EffectChain` builder
 * result, or an array mixing effects and chains (each chain contributes all its
 * effects in place). Already-resolved effects are themselves `SceneEffect`s, so
 * a node's read-back `effects` can be assigned straight back.
 *
 *   FX.blur(8)                        // chain
 *   { type: 'blur', radius: 8 }       // single effect
 *   [FX.blur(8), { type: 'invert' }]  // mixed array
 *   [...FX.blur(8), grayscaleEffect]
 */
export type Effect =
    | SceneEffect
    | EffectChain
    | (SceneEffect | EffectChain)[];

/**
 * Entry points for building effect chains fluently. Each delegates to the
 * matching {@link EffectChain} method, so every signature is declared once.
 *
 * @example
 * node.effects = FX.blur(8).grayscale(1);
 */
export const Effects = {
    blur: (options: number | BlurOptions) => new EffectChain().blur(options),
    directionalBlur: (options: number | DirectionalBlurOptions) => new EffectChain().directionalBlur(options),
    pixelate: (options: number | PixelateOptions) => new EffectChain().pixelate(options),
    grayscale: (options: number | GrayscaleOptions) => new EffectChain().grayscale(options),
    bulge: (options: number | BulgeOptions) => new EffectChain().bulge(options),
    magnify: (options?: number | MagnifyOptions) => new EffectChain().magnify(options),
    bloom: (options?: number | BloomOptions) => new EffectChain().bloom(options),
    vintage: (options?: number | VintageOptions) => new EffectChain().vintage(options),
    chromaticAberration: (options?: number | ChromaticAberrationOptions) =>
        new EffectChain().chromaticAberration(options),
    invert: (options?: number | InvertOptions) => new EffectChain().invert(options),
    scatter: (options?: number | ScatterOptions) => new EffectChain().scatter(options),
    posterize: (options?: number | PosterizeOptions) => new EffectChain().posterize(options),
    motionBlur: (options?: number | MotionBlurOptions) => new EffectChain().motionBlur(options),
    sksl: (options: SkSLOptions) => new EffectChain().sksl(options),
};

/** Shorthand alias for {@link Effects} — `FX.blur(8)` reads well at a call site. */
export const FX = Effects;

/**
 * Normalises any {@link Effect} value to a plain `SceneEffect[]`.
 * Used internally when reading props before rendering or interpolation.
 *
 * Chains used as array elements are flattened so each contributes its effects
 * in place: `[FX.blur(8), grayscaleEffect]`.
 */
export function resolveChainEffects(effects: Effect | undefined): SceneEffect[] {
    if (effects === undefined) return [];
    if (effects instanceof EffectChain) return effects.list;
    if (Array.isArray(effects)) {
        const out: SceneEffect[] = [];
        for (const item of effects) {
            if (item instanceof EffectChain) out.push(...item.list);
            else out.push(item);
        }
        return out;
    }
    return [effects];
}
