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
import type { HalftoneShape, HalftoneSeparation } from "./implementations/halftone";
import type { DitherMatrix, DitherNoise } from "./implementations/dither";
import type { ColorAdjustmentEffect } from "./implementations/color-adjustment";
import type { CurvesChannel } from "../filters/implementations/curves";
import type { BitCrushPalette } from "./implementations/bit-crush";
import type { AsciiCharset } from "./implementations/ascii";
import type { DisplaceChannel } from "./implementations/displace";
import type { WaveShape } from "./implementations/wave";
import type { ProgressiveBlurShape } from "./implementations/progressive-blur";

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

/**
 * A shadow cast from the node's silhouette. Scalar shorthand sets `blur`, since
 * softness is the knob a shadow is usually reached for by.
 */
export interface DropShadowOptions extends EffectOptions {
    /** Horizontal displacement in pixels (default 0). */
    offsetX?: number;
    /** Vertical displacement in pixels, positive being upward (default -8). */
    offsetY?: number;
    /** Softness in pixels, on a `blur` effect's scale (default 16). */
    blur?: number;
    /** Grows the silhouette before blurring, in pixels (default 0). */
    spread?: number;
    /** Shadow colour (default `'black'`). */
    color?: Color;
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
/**
 * A 3D colour lookup table — see {@link LutEffect} for the table's layout and
 * why it is compared by reference.
 *
 * No scalar shorthand: the dominant argument is a whole cube, and a builder that
 * took `Effects.lut(table)` would still need the size beside it to read it.
 */
export interface LutOptions extends EffectOptions {
    /** The cube, flat RGB triples, red-fastest. */
    table: Float32Array;
    /** Entries per axis. */
    size: number;
    /** 0–1 mix against the ungraded colour (default 1 — the full look). */
    amount?: number;
}

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
    /** Plates to screen into (default `'mono'`). */
    separation?: HalftoneSeparation;
}

/** Ordered (Bayer) dithering. Scalar shorthand sets `levels`. */
export interface DitherOptions extends EffectOptions {
    /** Output tones per channel, ≥ 2 (default 2). */
    levels?: number;
    /**
     * Threshold pattern (default `'bayer'`).
     *
     * `'bayer'` is the classic ordered matrix — a visible crosshatch, which is
     * the retro look and also what can beat against the pixel grid at some
     * `scale`s. `'blue'` is a void-and-cluster blue-noise field: same tone
     * reproduction, no lattice, no moiré. Reach for `'blue'` when the dither
     * should read as texture rather than as pattern.
     */
    noise?: DitherNoise;
    /** Bayer matrix size (default 4). Ignored when `noise` is `'blue'`. */
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

/**
 * Per-channel RGB offset. Scalar shorthand sets `amount`, which spreads red and
 * blue apart horizontally by that many pixels and leaves green put — the
 * everyday case. Name `red`/`green`/`blue` for full control.
 */
export interface RgbShiftOptions extends EffectOptions {
    /** Shorthand: ±px horizontal spread of red vs. blue (default 4). */
    amount?: number;
    /** Red plane offset in px. Overrides `amount` for this channel. */
    red?: Vector2;
    /** Green plane offset in px. */
    green?: Vector2;
    /** Blue plane offset in px. Overrides `amount` for this channel. */
    blue?: Vector2;
}

/** CRT scanlines. Scalar shorthand sets `darkness`. */
export interface ScanlinesOptions extends EffectOptions {
    /** 0–1 how far the bands darken (default 0.5). */
    darkness?: number;
    /** Distance between band centres in px (default 4). */
    spacing?: number;
    /** 0–1 share of each period the dark band covers (default 0.5). */
    thickness?: number;
    /** Band offset in px — animate to roll the pattern (default 0). */
    offset?: number;
    /** Band angle in degrees; 0 = horizontal (default 0). */
    angle?: number;
}

/** Datamosh-style band tearing. Scalar shorthand sets `amount`. */
export interface BlockDisplaceOptions extends EffectOptions {
    /** Maximum displacement in px (default 20). */
    amount?: number;
    /** Band thickness in px (default 16). */
    size?: number;
    /** 0–1 fraction of bands that move at all (default 0.3). */
    density?: number;
    /** Random field offset — step it to jump between glitch states (default 0). */
    seed?: number;
    /** Which way bands slide (default `'x'`). */
    axis?: EffectAxis;
}

/** ASCII art from a glyph grid. Scalar shorthand sets `size`. */
export interface AsciiOptions extends EffectOptions {
    /** Cell size in pixels — the width of one character (default 12). */
    size?: number;
    /** A named ramp, or a custom string ordered most-ink-first (default `'standard'`). */
    charset?: AsciiCharset | string;
    /** Family the glyphs are baked in; a monospace face reads best (default `'monospace'`). */
    fontFamily?: string;
    /** Glyph colour when `colored` is false (default `'white'`). */
    ink?: Color;
    /** Colour behind the glyphs (default `'black'`; use `'transparent'` to overlay). */
    background?: Color;
    /** Tint each glyph with its own cell's colour instead of using `ink` (default false). */
    colored?: boolean;
}

/** Anamorphic glare — a bright pass smeared along one axis. Scalar shorthand sets `intensity`. */
export interface StreakOptions extends EffectOptions {
    /** Additive multiplier for the streak pass (default 1). */
    intensity?: number;
    /** 0–1 luminance cutoff (default 0.7). */
    threshold?: number;
    /** Smear length in pixels (default 120). */
    length?: number;
    /** Smear axis in degrees; 0 = horizontal (default 0). */
    angle?: number;
}

/** Light streaming from a point. Scalar shorthand sets `intensity`. */
export interface GodRaysOptions extends EffectOptions {
    /** Additive multiplier for the ray pass (default 1). */
    intensity?: number;
    /** 0–1 luminance cutoff (default 0.6). */
    threshold?: number;
    /** Ray reach as a fraction of the distance to `center` (default 0.6). */
    length?: number;
    /** Light source in 0–1 layer coords (default middle). */
    center?: Vector2;
    /** Per-step falloff; below 1 the rays fade with distance (default 0.96). */
    decay?: number;
    /** Taps marched per pixel, 4–48 (default 32). */
    samples?: number;
}

/** Image overlay for material looks. Scalar shorthand sets `amount`. */
export interface TextureOptions extends EffectOptions {
    /** Image path, resolved like an image fill's `src`. */
    src: string;
    /** 0–1 blend strength (default 1). */
    amount?: number;
    /** How it composites (default `'multiply'`). */
    blend?: BlendMode;
    /** 1 covers the node once; 2 tiles it at half size (default 1). */
    scale?: number;
    /** Rotation in degrees (default 0). */
    angle?: number;
}

/** Kuwahara brushwork. Scalar shorthand sets `radius`. */
export interface OilPaintOptions extends EffectOptions {
    /** Window radius in pixels — brush size, capped at 6 (default 3). */
    radius?: number;
}

/**
 * Displacement map. Scalar shorthand sets `amount` on both axes.
 *
 * `mode: 'backdrop'` displaces what is painted beneath the node instead — i.e.
 * refraction through the node's silhouette.
 */
export interface DisplaceOptions extends EffectOptions {
    /** Map image path, resolved like an image fill's `src`. */
    src: string;
    /** Displacement in px — a number for both axes, or per-axis via `{ x, y }` (default 20). */
    amount?: number | Vector2;
    /** Which channels of the map are read (default `'rg'`). */
    channel?: DisplaceChannel;
    /** The map value meaning "don't move" (default 0.5, what signed maps use). */
    midpoint?: number;
    /** 1 covers the node once; 2 tiles it at half size (default 1). */
    scale?: number;
    /** Map rotation in degrees (default 0). */
    angle?: number;
}

/** Sine warp. Scalar shorthand sets `amplitude` on the Y axis — the everyday ripple. */
export interface WaveOptions extends EffectOptions {
    /** Peak displacement in px — a number (Y only), or per-axis via `{ x, y }` (default 20). */
    amplitude?: number | Vector2;
    /** Distance between crests in px (default 120). */
    wavelength?: number;
    /** Phase in degrees; tween over 360 for one seamless loop (default 0). */
    phase?: number;
    /** Parallel bands or concentric rings (default `'linear'`). */
    shape?: WaveShape;
    /** Direction the crests advance along, in degrees (default 0). `'linear'` only. */
    angle?: number;
    /** Ring origin in 0–1 layer coords (default middle). `'radial'` only. */
    center?: Vector2;
}

/** Twirl / swirl vortex. Scalar shorthand sets `angle`. */
export interface TwirlOptions extends EffectOptions {
    /** Rotation at the centre in degrees (default 180). */
    angle?: number;
    /** 0–1 radius of influence (default 1 — the whole node). */
    radius?: number;
    /** Vortex centre in 0–1 layer coords (default middle). */
    center?: Vector2;
}

/**
 * Blur that ramps across the node. Scalar shorthand sets `radius`.
 *
 * `mode: 'backdrop'` gives the frosted panel whose blur fades out rather than
 * ending at a hard edge.
 */
export interface ProgressiveBlurOptions extends EffectOptions {
    /** Blur spread in px at the far end of the ramp (default 24). */
    radius?: number;
    /** Blur spread in px at the near end of the ramp (default 0, i.e. sharp). */
    startRadius?: number;
    /** Ramp layout (default `'linear'`). */
    shape?: ProgressiveBlurShape;
    /** 0–1 where the blur starts building (default 0). */
    start?: number;
    /** 0–1 where it reaches `radius` (default 1). */
    end?: number;
    /** Ramp direction in degrees; 0 = left-to-right (default 90, i.e. downward). */
    angle?: number;
    /** Ramp origin in 0–1 layer coords (default middle). `'radial'` only. */
    center?: Vector2;
    /** Taps averaged at full radius, 2–32 (default 20). */
    samples?: number;
}

/** Mirrored wedges around a point. Scalar shorthand sets `segments`. */
export interface KaleidoscopeOptions extends EffectOptions {
    /** Number of mirrored wedges; below 2 is a no-op (default 6). */
    segments?: number;
    /** Rotation of the pattern in degrees — animate to sweep the source (default 0). */
    angle?: number;
    /** Fold origin in 0–1 layer coords (default middle). */
    center?: Vector2;
    /** Radial offset of the sampled wedge (default 0). */
    offset?: number;
    /** 0–1 blend from the original to the folded pattern — the handle to ramp it on (default 1). */
    amount?: number;
}

/** Motion trails from past frames. Scalar shorthand sets `echoes`. */
export interface TrailsOptions extends EffectOptions {
    /** Past-frame taps drawn behind the current frame (default 6). */
    echoes?: number;
    /** Delay between taps in seconds (default 1 / 24). */
    delay?: number;
    /** Per-tap alpha multiplier (default 0.72). */
    decay?: number;
    /** How the taps composite (default `'screen'`). */
    blend?: BlendMode;
}

/**
 * Bevelled glass over the backdrop. Scalar shorthand sets `refraction`.
 *
 * Every amount is 0–100 rather than a pixel figure — the renderer scales each
 * against the node's own size, so the same numbers read the same on a chip and
 * on a full-bleed panel (see {@link GlassEffect}). All five default to 100 and
 * the light to `0°` at full intensity, matching Figma's own defaults, so a bare
 * `FX.glass()` is the effect as a designer coming from Figma expects it.
 *
 * Defaults to `{ mode: 'backdrop' }`; there is nothing to refract in a node's
 * own paint, so the foreground is a no-op.
 */
export interface GlassOptions extends EffectOptions {
    /** Direction the light arrives from, in degrees clockwise from the right (default 0). */
    lightAngle?: number;
    /** 0–100 brightness of the specular rim (default 100). */
    lightIntensity?: number;
    /** 0–100 sideways pull along the edge normal (default 100). */
    refraction?: number;
    /** 0–100 how far inward the bevel reaches (default 100). */
    depth?: number;
    /** 0–100 spread between the R/G/B samples (default 100). */
    dispersion?: number;
    /** 0–100 blend toward a blurred backdrop (default 100). */
    frost?: number;
    /** 0–100 spread of the highlight — 0 a glint, 100 a rim wash (default 100). */
    splay?: number;
}

/** Colour-depth reduction. Scalar shorthand sets `bits`. */
export interface BitCrushOptions extends EffectOptions {
    /** Bits per channel when `palette` is `'none'`, 1–8 (default 3). */
    bits?: number;
    /** Fixed hardware palette to snap to (default `'none'`). */
    palette?: BitCrushPalette;
    /** 0–1 blend between original and crushed (default 1). */
    amount?: number;
}

const CENTER: Vector2 = { x: 0.5, y: 0.5 };
const ZERO: Vector2 = { x: 0, y: 0 };

/** Normalise {@link PixelateOptions.blocks} to a per-axis count. */
const toBlocks = (blocks: number | Vector2): Vector2 =>
    typeof blocks === "number" ? { x: blocks, y: blocks } : blocks;

/** Normalise a scalar-or-vector px option to both axes. */
const toBothAxes = (value: number | Vector2): Vector2 =>
    typeof value === "number" ? { x: value, y: value } : value;

/**
 * Normalise {@link WaveOptions.amplitude}. A bare number means the Y axis only —
 * a wave that displaces along its own direction of travel just smears, so the
 * transverse case is the one worth spelling `20` for.
 */
const toAmplitude = (value: number | Vector2): Vector2 =>
    typeof value === "number" ? { x: 0, y: value } : value;

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
     * Append a drop shadow cast from the node's **silhouette** — including alpha
     * silhouettes (text, an image's cutout, a whole subtree) that a geometry
     * `shadow` can't follow, since that one fills the node's path.
     */
    dropShadow(options?: number | DropShadowOptions) {
        const o = scalarOptions(options, "blur");
        return this.append(withEffectOptions(
            {
                type: "dropShadow" as const,
                offsetX: o.offsetX ?? 0,
                offsetY: o.offsetY ?? -8,
                blur: o.blur ?? 16,
                spread: o.spread ?? 0,
                color: o.color ?? "black",
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
    /**
     * Apply a 3D colour lookup table.
     *
     * The whole point of a LUT is that it is *someone else's* colour science, so
     * there is nothing to default beyond how much of it to use: `amount` is the
     * mix and everything else is the file.
     *
     * @example
     * FX.lut({ table, size: 33 })            // the full look
     * FX.lut({ table, size: 33, amount: 0.6 })
     */
    lut(options: LutOptions) {
        return this.append(withEffectOptions(
            {
                type: "lut" as const,
                table: options.table,
                size: options.size,
                amount: options.amount ?? 1,
            },
            options,
        ));
    }

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
                separation: o.separation ?? "mono",
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
                noise: o.noise ?? "bayer",
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
     * Append a tone curve — the same adjustment `Adjustments.curves` applies to a
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
     * shadows / highlights / temperature / tint) — `Adjustments.colorAdjustment`
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
     * Append a per-channel RGB offset — the digital cousin of
     * {@link EffectChain.chromaticAberration}, where each plane goes where you
     * point it instead of following a lens model.
     */
    rgbShift(options?: number | RgbShiftOptions) {
        const o = scalarOptions(options, "amount");
        const spread = o.amount ?? 4;
        return this.append(withEffectOptions(
            {
                type: "rgbShift" as const,
                red: o.red ?? { x: spread, y: 0 },
                green: o.green ?? ZERO,
                blue: o.blue ?? { x: -spread, y: 0 },
            },
            o,
        ));
    }

    /**
     * Append CRT scanlines. Animate `offset` past `spacing` to roll the bands;
     * the pattern wraps, so a linear tween loops seamlessly.
     */
    scanlines(options?: number | ScanlinesOptions) {
        const o = scalarOptions(options, "darkness");
        return this.append(withEffectOptions(
            {
                type: "scanlines" as const,
                spacing: o.spacing ?? 4,
                thickness: o.thickness ?? 0.5,
                darkness: o.darkness ?? 0.5,
                offset: o.offset ?? 0,
                angle: o.angle ?? 0,
            },
            o,
        ));
    }

    /**
     * Append datamosh-style band tearing. Step `seed` in whole numbers to jump
     * between distinct glitch states rather than sliding between them.
     */
    blockDisplace(options?: number | BlockDisplaceOptions) {
        const o = scalarOptions(options, "amount");
        return this.append(withEffectOptions(
            {
                type: "blockDisplace" as const,
                amount: o.amount ?? 20,
                size: o.size ?? 16,
                density: o.density ?? 0.3,
                seed: o.seed ?? 0,
                axis: o.axis ?? "x",
            },
            o,
        ));
    }

    /**
     * Append colour-depth reduction — `bits` per channel, or a fixed hardware
     * palette. Pair with {@link EffectChain.dither} so gradients survive the cut.
     */
    bitCrush(options?: number | BitCrushOptions) {
        const o = scalarOptions(options, "bits");
        return this.append(withEffectOptions(
            {
                type: "bitCrush" as const,
                bits: o.bits ?? 3,
                palette: o.palette ?? "none",
                amount: o.amount ?? 1,
            },
            o,
        ));
    }

    /**
     * Append ASCII art — the content divided into a grid of cells, each cell's
     * tone replaced by the glyph that carries a matching amount of ink.
     *
     * Set `background: 'transparent'` to lay the glyphs over whatever is behind
     * the node instead of over a solid field.
     */
    ascii(options?: number | AsciiOptions) {
        const o = scalarOptions(options, "size");
        return this.append(withEffectOptions(
            {
                type: "ascii" as const,
                size: o.size ?? 12,
                charset: o.charset ?? "standard",
                fontFamily: o.fontFamily ?? "monospace",
                ink: o.ink ?? "white",
                background: o.background ?? "black",
                colored: o.colored ?? false,
            },
            o,
        ));
    }

    /**
     * Append an image overlay — paper grain, canvas weave, fabric. The image is
     * yours: drop it in the project's `public/` folder and name it the way an
     * image fill would.
     *
     * A missing or not-yet-loaded image makes the effect a no-op, so a wrong
     * path costs you the texture and nothing else.
     */
    texture(options: TextureOptions) {
        return this.append(withEffectOptions(
            {
                type: "texture" as const,
                src: options.src,
                amount: options.amount ?? 1,
                blend: options.blend ?? "multiply",
                scale: options.scale ?? 1,
                angle: options.angle ?? 0,
            },
            options,
        ));
    }

    /**
     * Append Kuwahara brushwork — averages within a region but never across an
     * edge, so flat areas smooth into strokes while boundaries stay crisp.
     * By some margin the most expensive effect in the set; keep `radius` small.
     */
    oilPaint(options?: number | OilPaintOptions) {
        const o = scalarOptions(options, "radius");
        return this.append(withEffectOptions({ type: "oilPaint" as const, radius: o.radius ?? 3 }, o));
    }

    /**
     * Append an anamorphic streak — a bright pass smeared along one axis and
     * screened back on. {@link EffectChain.bloom} spreads light in every
     * direction; this spreads it in one.
     */
    streak(options?: number | StreakOptions) {
        const o = scalarOptions(options, "intensity");
        return this.append(withEffectOptions(
            {
                type: "streak" as const,
                intensity: o.intensity ?? 1,
                threshold: o.threshold ?? 0.7,
                length: o.length ?? 120,
                angle: o.angle ?? 0,
            },
            o,
        ));
    }

    /**
     * Append god rays — bright areas streamed outward from `center` and screened
     * over the source, so light appears to pass whatever occludes it.
     */
    godRays(options?: number | GodRaysOptions) {
        const o = scalarOptions(options, "intensity");
        return this.append(withEffectOptions(
            {
                type: "godRays" as const,
                intensity: o.intensity ?? 1,
                threshold: o.threshold ?? 0.6,
                length: o.length ?? 0.6,
                center: o.center ?? CENTER,
                decay: o.decay ?? 0.96,
                samples: o.samples ?? 32,
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

    /**
     * Append a displacement map — the content resampled at a position pushed
     * around by a second image, rather than recoloured.
     *
     * With `{ mode: 'backdrop' }` the displacement runs on what is painted
     * beneath the node and is clipped to its silhouette, which is refraction:
     * the scene bends through the shape while the shape's own edges stay sharp.
     */
    displace(options: DisplaceOptions) {
        const o = options;
        return this.append(withEffectOptions(
            {
                type: "displace" as const,
                src: o.src,
                amount: toBothAxes(o.amount ?? 20),
                channel: o.channel ?? "rg",
                midpoint: o.midpoint ?? 0.5,
                scale: o.scale ?? 1,
                angle: o.angle ?? 0,
            },
            o,
        ));
    }

    /**
     * Append a sine warp. Tween `phase` over 360 to make the wave travel — it
     * wraps, so a linear tween loops seamlessly.
     */
    wave(options?: number | WaveOptions) {
        const o = scalarOptions(options, "amplitude");
        return this.append(withEffectOptions(
            {
                type: "wave" as const,
                amplitude: toAmplitude(o.amplitude ?? 20),
                wavelength: o.wavelength ?? 120,
                phase: o.phase ?? 0,
                shape: o.shape ?? "linear",
                angle: o.angle ?? 0,
                center: o.center ?? CENTER,
            },
            o,
        ));
    }

    /**
     * Append a twirl / swirl vortex — a rotation about `center` that falls off
     * with distance, so the middle spins while the rim stays pinned.
     */
    twirl(options?: number | TwirlOptions) {
        const o = scalarOptions(options, "angle");
        return this.append(withEffectOptions(
            {
                type: "twirl" as const,
                angle: o.angle ?? 180,
                radius: o.radius ?? 1,
                center: o.center ?? CENTER,
            },
            o,
        ));
    }

    /**
     * Append a blur whose radius ramps across the node rather than being
     * uniform. With `{ mode: 'backdrop' }` this is the frosted panel whose blur
     * fades out instead of ending at a hard edge.
     */
    progressiveBlur(options?: number | ProgressiveBlurOptions) {
        const o = scalarOptions(options, "radius");
        return this.append(withEffectOptions(
            {
                type: "progressiveBlur" as const,
                radius: o.radius ?? 24,
                // Sharp at the near end unless asked otherwise — what this
                // effect did before the field existed.
                startRadius: o.startRadius ?? 0,
                shape: o.shape ?? "linear",
                start: o.start ?? 0,
                end: o.end ?? 1,
                angle: o.angle ?? 90,
                center: o.center ?? CENTER,
                samples: o.samples ?? 20,
            },
            o,
        ));
    }

    /**
     * Append a kaleidoscope fold. Animating `angle` sweeps fresh source material
     * through the sampled wedge while the pattern itself stays locked — which is
     * not what rotating the node does.
     */
    kaleidoscope(options?: number | KaleidoscopeOptions) {
        const o = scalarOptions(options, "segments");
        return this.append(withEffectOptions(
            {
                type: "kaleidoscope" as const,
                segments: Math.round(o.segments ?? 6),
                angle: o.angle ?? 0,
                center: o.center ?? CENTER,
                offset: o.offset ?? 0,
                amount: o.amount ?? 1,
            },
            o,
        ));
    }

    /**
     * Append motion trails — the node composited with a trail of its own past
     * frames. History-dependent, so it is exact under linear playback and export
     * and refills after a backwards scrub; see {@link TrailsEffect}.
     */
    trails(options?: number | TrailsOptions) {
        const o = scalarOptions(options, "echoes");
        return this.append(withEffectOptions(
            {
                type: "trails" as const,
                echoes: Math.round(o.echoes ?? 6),
                delay: o.delay ?? 1 / 24,
                decay: o.decay ?? 0.72,
                blend: o.blend ?? "screen",
            },
            o,
        ));
    }

    /**
     * Append bevelled glass — the backdrop refracted, dispersed and frosted
     * through the node's silhouette, with a specular rim along the bevel.
     *
     * Like `magnify`, this reads what is painted *beneath* the node and is
     * clipped to its outline, so the shape's own edges stay sharp. Unlike
     * `displace` it needs no map: the bevel is derived from the silhouette
     * itself, so it follows a rounded rect, an ellipse or a hand-drawn path
     * equally.
     *
     * Defaults to `{ mode: 'backdrop' }`; pass `mode` explicitly to override.
     */
    glass(options?: number | GlassOptions) {
        const o = scalarOptions(options, "refraction");
        return this.append(withEffectOptions(
            {
                type: "glass" as const,
                lightAngle: o.lightAngle ?? 0,
                lightIntensity: o.lightIntensity ?? 100,
                refraction: o.refraction ?? 100,
                depth: o.depth ?? 100,
                dispersion: o.dispersion ?? 100,
                frost: o.frost ?? 100,
                splay: o.splay ?? 100,
            },
            { mode: o.mode ?? "backdrop" },
        ));
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
 * Entry point for building effect chains fluently.
 *
 * An empty {@link EffectChain}, so `FX.blur(8)` *is* `new EffectChain().blur(8)`
 * — every builder's signature and documentation has exactly one definition, on
 * the class, which is also what an editor shows when you hover `FX.blur`.
 * (A parallel object of arrow functions would need its own copy of all 41 docs,
 * and hovering it showed none of them.)
 *
 * The chain is immutable — every builder returns a *new* chain — so sharing one
 * empty instance as the entry point is safe.
 *
 * @example
 * node.effects = FX.blur(8).grayscale(1);
 */
export const Effects = new EffectChain();

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
