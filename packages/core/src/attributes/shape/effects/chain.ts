import { SceneEffect } from "./union";
import type { Vector2 } from "@/attributes/layout/vector2";
import type { BlendMode } from "../fill/blend";
import type { Color } from "../fill/color/parser";
import type { EffectAxis, EffectOptions } from "./effect-data";
import { scalarOptions, withEffectOptions } from "./effect-data";
import type { InvertChannel } from "./implementations/invert";
import type { MotionBlurAlignment } from "./implementations/motion-blur";
import type { SkSLUniform } from "./implementations/sksl";
import type { OutlinePosition } from "./implementations/outline";
import type { EdgeKernel } from "./implementations/edges";
import type { RadialBlurStyle } from "./implementations/radial-blur";
import type { HalftoneShape } from "./implementations/halftone";
import type { DitherMatrix } from "./implementations/dither";
import type { ColorAdjustmentEffect } from "./implementations/color-adjustment";
import type { CurvesChannel } from "../filters/implementations/curves";

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

/** Coloured band around the node's silhouette. Scalar shorthand sets `width`. */
export interface OutlineOptions extends EffectOptions {
    /** Band thickness in pixels (default 4). */
    width?: number;
    /** Band colour (default `'black'`). */
    color?: Color;
    /** Which side of the edge the band grows from (default `'outside'`). */
    position?: OutlinePosition;
}

/** Darkened edges / lens falloff. Scalar shorthand sets `amount`. */
export interface VignetteOptions extends EffectOptions {
    /** 0–1 tint strength at the edge (default 0.5). */
    amount?: number;
    /** 0–1 normalised radius where the falloff starts (default 0.75). */
    radius?: number;
    /** 0–1 ramp width; 0 is a hard ring (default 0.5). */
    softness?: number;
    /** Tint colour (default `'black'`). */
    color?: Color;
}

/** Film grain. Scalar shorthand sets `amount`. */
export interface GrainOptions extends EffectOptions {
    /** 0–1 noise amplitude (default 0.25). */
    amount?: number;
    /** Grain cell size in pixels (default 1). */
    size?: number;
    /** Random field offset — animate it for frame-locked shimmer (default 0). */
    seed?: number;
    /** Re-seed every frame from elapsed time (default false). */
    animated?: boolean;
    /** Per-channel colour speckle instead of luminance noise (default false). */
    colored?: boolean;
}

/** Unsharp-mask sharpen. Scalar shorthand sets `amount`. */
export interface SharpenOptions extends EffectOptions {
    /** Edge-contrast boost (default 1). */
    amount?: number;
    /** Radius of the blurred reference, in pixels (default 1). */
    radius?: number;
}

/** Edge detection. Scalar shorthand sets `strength`. */
export interface EdgesOptions extends EffectOptions {
    /** Multiplier on the detected gradient (default 1). */
    strength?: number;
    /** Which operator measures the gradient (default `'sobel'`). */
    kernel?: EdgeKernel;
    /** Detect per RGB channel instead of on luminance (default false). */
    colored?: boolean;
}

/** Two-tone luminance cut. Scalar shorthand sets `level`. */
export interface ThresholdOptions extends EffectOptions {
    /** 0–1 cut point (default 0.5). */
    level?: number;
    /** 0–1 ramp width around the cut (default 0.05 — just enough to anti-alias). */
    smoothness?: number;
}

/** Zoom / spin blur about a point. Scalar shorthand sets `amount`. */
export interface RadialBlurOptions extends EffectOptions {
    /** Smear length, 0–1 (default 0.5). */
    amount?: number;
    /** Radial rush (`'zoom'`) or rotational streak (`'spin'`) (default `'zoom'`). */
    style?: RadialBlurStyle;
    /** Blur centre in 0–1 layer coords (default middle). */
    center?: Vector2;
    /** Taps averaged per pixel (default 16, max 32). */
    samples?: number;
}

/** Halftone print screen. Scalar shorthand sets `size`. */
export interface HalftoneOptions extends EffectOptions {
    /** Cell pitch in pixels (default 8). */
    size?: number;
    /** Screen rotation in degrees (default 45). */
    angle?: number;
    /** Mark drawn per cell (default `'dot'`). */
    shape?: HalftoneShape;
    /** Screen each RGB channel at offset angles (default false). */
    colored?: boolean;
}

/** Ordered (Bayer) dithering. Scalar shorthand sets `levels`. */
export interface DitherOptions extends EffectOptions {
    /** Output tones per channel, ≥ 2 (default 2). */
    levels?: number;
    /** Bayer matrix size (default 4). */
    matrix?: DitherMatrix;
    /** Pattern cell size in pixels (default 1). */
    scale?: number;
    /** Dither luminance to black and white (default false). */
    monochrome?: boolean;
}

/** Two-colour luminance ramp. Scalar shorthand sets `amount`. */
export interface DuotoneOptions extends EffectOptions {
    /** 0–1 blend from the original colours to the full ramp (default 1). */
    amount?: number;
    /** Colour the darkest tones map to (default `'black'`). */
    shadows?: Color;
    /** Colour the brightest tones map to (default `'white'`). */
    highlights?: Color;
}

/** Tone curve through control points. */
export interface CurvesOptions extends EffectOptions {
    /** Curve control points as `[input, output]` pairs in 0–1. */
    points: [number, number][];
    /** Channel(s) the curve applies to (default `'rgb'`). */
    channel?: CurvesChannel;
}

/** Photographic grading. Every field is optional and defaults to neutral. */
export type ColorAdjustmentOptions = Omit<ColorAdjustmentEffect, 'type'> & EffectOptions;

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
     * Append an outline — a coloured band traced around the node's silhouette,
     * including alpha silhouettes (text, an image's cutout, a whole subtree) that
     * a geometry `stroke` can't follow.
     */
    outline(options?: number | OutlineOptions) {
        const o = scalarOptions(options, "width");
        return this.append(withEffectOptions(
            {
                type: "outline" as const,
                width: o.width ?? 4,
                color: o.color ?? "black",
                position: o.position ?? "outside",
            },
            o,
        ));
    }

    /**
     * Append a vignette — a soft tint ramping in toward the node's corners. The
     * falloff follows the node's aspect ratio, so a wide node darkens along its
     * short edges the way a lens would.
     */
    vignette(options?: number | VignetteOptions) {
        const o = scalarOptions(options, "amount");
        return this.append(withEffectOptions(
            {
                type: "vignette" as const,
                amount: o.amount ?? 0.5,
                radius: o.radius ?? 0.75,
                softness: o.softness ?? 0.5,
                color: o.color ?? "black",
            },
            o,
        ));
    }

    /**
     * Append film grain. Static grain reads as texture rather than film, so pass
     * `{ animated: true }` to re-seed it each frame — or tween `seed` when the
     * render has to stay deterministic.
     */
    grain(options?: number | GrainOptions) {
        const o = scalarOptions(options, "amount");
        return this.append(withEffectOptions(
            {
                type: "grain" as const,
                amount: o.amount ?? 0.25,
                size: o.size ?? 1,
                seed: o.seed ?? 0,
                animated: o.animated ?? false,
                colored: o.colored ?? false,
            },
            o,
        ));
    }

    /** Append an unsharp-mask sharpen — local contrast boosted at `radius` scale. */
    sharpen(options?: number | SharpenOptions) {
        const o = scalarOptions(options, "amount");
        return this.append(withEffectOptions(
            { type: "sharpen" as const, amount: o.amount ?? 1, radius: o.radius ?? 1 },
            o,
        ));
    }

    /**
     * Append edge detection — flat areas go black and boundaries light up with
     * the magnitude of the local gradient.
     */
    edges(options?: number | EdgesOptions) {
        const o = scalarOptions(options, "strength");
        return this.append(withEffectOptions(
            {
                type: "edges" as const,
                strength: o.strength ?? 1,
                kernel: o.kernel ?? "sobel",
                colored: o.colored ?? false,
            },
            o,
        ));
    }

    /**
     * Append a luminance threshold — a two-tone stencil cut at `level`, with
     * `smoothness` widening the cut into a ramp.
     */
    threshold(options?: number | ThresholdOptions) {
        const o = scalarOptions(options, "level");
        return this.append(withEffectOptions(
            { type: "threshold" as const, level: o.level ?? 0.5, smoothness: o.smoothness ?? 0.05 },
            o,
        ));
    }

    /**
     * Append a radial blur — samples smeared along the radius (`'zoom'`, the
     * default) or the tangent (`'spin'`) about `center`, leaving the centre sharp.
     */
    radialBlur(options?: number | RadialBlurOptions) {
        const o = scalarOptions(options, "amount");
        return this.append(withEffectOptions(
            {
                type: "radialBlur" as const,
                amount: o.amount ?? 0.5,
                style: o.style ?? "zoom",
                center: o.center ?? CENTER,
                samples: o.samples ?? 16,
            },
            o,
        ));
    }

    /**
     * Append a halftone screen — the newsprint look, where tone becomes the size
     * of a mark on a rotated grid.
     */
    halftone(options?: number | HalftoneOptions) {
        const o = scalarOptions(options, "size");
        return this.append(withEffectOptions(
            {
                type: "halftone" as const,
                size: o.size ?? 8,
                angle: o.angle ?? 45,
                shape: o.shape ?? "dot",
                colored: o.colored ?? false,
            },
            o,
        ));
    }

    /**
     * Append ordered (Bayer) dithering — quantization to `levels` tones per
     * channel with the error traded for a retro crosshatch pattern.
     */
    dither(options?: number | DitherOptions) {
        const o = scalarOptions(options, "levels");
        return this.append(withEffectOptions(
            {
                type: "dither" as const,
                levels: o.levels ?? 2,
                matrix: o.matrix ?? 4,
                scale: o.scale ?? 1,
                monochrome: o.monochrome ?? false,
            },
            o,
        ));
    }

    /**
     * Append a duotone / gradient map — the content's luminance remapped onto a
     * `shadows` → `highlights` ramp, discarding its original chroma.
     */
    duotone(options?: number | DuotoneOptions) {
        const o = scalarOptions(options, "amount");
        return this.append(withEffectOptions(
            {
                type: "duotone" as const,
                amount: o.amount ?? 1,
                shadows: o.shadows ?? "black",
                highlights: o.highlights ?? "white",
            },
            o,
        ));
    }

    /**
     * Append a tone curve — the same adjustment `ImageFilters.curves` applies to a
     * photo, on any node.
     */
    curves(options: CurvesOptions) {
        return this.append(withEffectOptions(
            { type: "curves" as const, points: options.points, channel: options.channel ?? "rgb" },
            options,
        ));
    }

    /**
     * Append photographic grading (brightness / contrast / saturation / vibrance /
     * shadows / highlights / temperature / tint) — `ImageFilters.colorAdjustment`
     * on any node. For darkened edges use {@link EffectChain.vignette}.
     */
    colorAdjustment(options: ColorAdjustmentOptions) {
        // Destructure `mode` out rather than spreading it through: a caller who
        // writes `{ mode: undefined }` would otherwise plant the key on the
        // effect, and `equals()` compares `mode` directly. `withEffectOptions`
        // skips undefined, so handing it back there is safe.
        const { mode, ...fields } = options;
        return this.append(withEffectOptions({ type: "colorAdjustment" as const, ...fields }, { mode }));
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
    outline: (options?: number | OutlineOptions) => new EffectChain().outline(options),
    vignette: (options?: number | VignetteOptions) => new EffectChain().vignette(options),
    grain: (options?: number | GrainOptions) => new EffectChain().grain(options),
    sharpen: (options?: number | SharpenOptions) => new EffectChain().sharpen(options),
    edges: (options?: number | EdgesOptions) => new EffectChain().edges(options),
    threshold: (options?: number | ThresholdOptions) => new EffectChain().threshold(options),
    radialBlur: (options?: number | RadialBlurOptions) => new EffectChain().radialBlur(options),
    halftone: (options?: number | HalftoneOptions) => new EffectChain().halftone(options),
    dither: (options?: number | DitherOptions) => new EffectChain().dither(options),
    duotone: (options?: number | DuotoneOptions) => new EffectChain().duotone(options),
    curves: (options: CurvesOptions) => new EffectChain().curves(options),
    colorAdjustment: (options: ColorAdjustmentOptions) => new EffectChain().colorAdjustment(options),
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
