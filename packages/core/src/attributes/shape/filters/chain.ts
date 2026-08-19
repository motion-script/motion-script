import { MediaAdjustment, VideoOnlyAdjustment } from "./union";
import { EffectChain } from "../effects/chain";
import type { BlendMode } from "../fill/blend";
import type { ColorAdjustmentFilter } from "./implementations/color-adjustment";
import type { CurvesChannel } from "./implementations/curves";
import type { EffectOptions } from "../effects/effect-data";
import type {
    AsciiOptions,
    BitCrushOptions,
    BlockDisplaceOptions,
    BloomOptions,
    BulgeOptions,
    ChromaticAberrationOptions,
    DirectionalBlurOptions,
    DisplaceOptions,
    DitherOptions,
    DuotoneOptions,
    EdgesOptions,
    GodRaysOptions,
    GrainOptions,
    HalftoneOptions,
    InvertOptions,
    LutOptions,
    KaleidoscopeOptions,
    OilPaintOptions,
    PixelateOptions,
    PosterizeOptions,
    ProgressiveBlurOptions,
    RadialBlurOptions,
    RgbShiftOptions,
    ScanlinesOptions,
    ScatterOptions,
    SharpenOptions,
    SkSLOptions,
    StreakOptions,
    TextureOptions,
    ThresholdOptions,
    TwirlOptions,
    VignetteOptions,
    VintageOptions,
    WaveOptions,
} from "../effects/chain";

/** Any concrete filter a chain may hold — pixel or video-only. */
type AnyFilter = MediaAdjustment | VideoOnlyAdjustment;

/**
 * ## Adjustments and filters are two layers, not two names for one thing
 *
 * An **adjustment** is the unit an author writes: `Adjustments.blur(8)`, one
 * entry in the ordered chain a media fill's `preset` carries. A **filter** is
 * the primitive the renderer realises it as — `BlurFilter`, `CurvesFilter`, and
 * the `FilterData` handlers in `registry.ts`.
 *
 * Most of the time the two are one-to-one, which is what makes the distinction
 * look like pedantry. It isn't: an editor above this layer composes adjustments
 * that have no primitive of their own (a lift/gamma/gain grade is three
 * per-channel `CurvesFilter`s), and one primitive — the LUT's texture lookup —
 * is reached through no chain builder at all. Naming the two layers apart is
 * what lets that mapping be written down instead of assumed.
 *
 * It also settles a collision with no good answer otherwise: the options for
 * `Adjustments.colorAdjustment(…)` are named after the primitive they omit from
 * (`ColorAdjustmentFilterOptions`), because `ColorAdjustmentAdjustmentOptions`
 * is not a name anyone should have to type.
 *
 * ## The builders
 *
 * Media adjustments follow the same one-argument rule as scene effects: every
 * builder takes a single options object, and those with one dominant scalar
 * also accept that scalar directly. Field names are the shared vocabulary —
 * `radius` for a pixel distance, `amount` for a 0–1 intensity — so
 * `Adjustments.blur(8)` and `Effects.blur(8)` describe the same quantity.
 *
 * Most of the roster *is* the scene-effect roster: an adjustment is an effect
 * applied to one fill layer's own pixels instead of to a node and everything
 * beneath it, so `Adjustments.oilPaint(4)` and `Effects.oilPaint(4)` are the
 * same implementation reached two ways. See {@link EffectAdjustment} for the
 * short list of effects that cannot be adjustments.
 */

/** Gaussian blur. Scalar shorthand sets `radius`. */
export interface BlurFilterOptions {
    /** Blur radius in pixels. */
    radius: number;
}

/** Desaturation. Scalar shorthand sets `amount`. */
export interface GrayscaleFilterOptions {
    /** 0 = original, 1 = fully grayscale. */
    amount: number;
}

/** Alpha (opacity) multiply. Scalar shorthand sets `amount`. */
export interface AlphaFilterOptions {
    /** 0 = fully transparent, 1 = unchanged. */
    amount: number;
}

/** Luminance scale. Scalar shorthand sets `amount`. */
export interface ExposureFilterOptions {
    /** Exposure multiplier. 1 = unchanged, >1 brighter, <1 darker. */
    amount: number;
}

/** Raw 4×5 row-major colour matrix. Array shorthand sets `matrix`. */
export interface ColorMatrixFilterOptions {
    /** 4×5 row-major colour matrix in Skia format. */
    matrix: number[];
}

/** Tone curve through control points. */
export interface CurvesFilterOptions {
    /** Curve control points as [input, output] pairs in [0, 1]. */
    points: [number, number][];
    /** Channel(s) to apply the curve to (default `'rgb'`). */
    channel?: CurvesChannel;
}

/** Photographic tonal/colour adjustments. All fields optional. */
export type ColorAdjustmentFilterOptions = Omit<ColorAdjustmentFilter, 'type'>;

/** Stop-motion frame-rate resample (video only). Scalar shorthand sets `fps`. */
export interface PosterizeTimeFilterOptions {
    /** Target frame rate the source playhead snaps to. */
    fps: number;
}

/** Motion-trail echo of past frames (video only). */
export interface EchoFilterOptions {
    /** Number of past-frame taps drawn behind the current frame. */
    echoes: number;
    /** Delay between successive taps, in source seconds. */
    delay: number;
    /** Per-tap alpha multiplier; tap `n` is drawn at `decay ** n` (default 0.5). */
    decay?: number;
    /** Blend mode used to composite the echo taps (default `'screen'`). */
    blend?: BlendMode;
}

/**
 * A scene effect's builder options as a **filter** accepts them: the same
 * fields minus the cross-cutting {@link EffectOptions} (today `mode`).
 *
 * A filter is on the fill's own pixels by definition, so there is no backdrop
 * to point it at — dropping the knob is clearer than accepting it and silently
 * ignoring it. Scalar shorthands survive untouched.
 */
type AsFilterOptions<T> = T extends number ? number : Omit<T, keyof EffectOptions>;

/** Normalise a `number | Options` filter argument onto its dominant field. */
function scalarFilter<O extends object>(arg: number | O, key: keyof O): O {
    return typeof arg === "number" ? ({ [key]: arg } as O) : arg;
}

/**
 * The single effect a one-builder {@link EffectChain} produced.
 *
 * Every effect-backed filter routes through here rather than re-declaring the
 * effect literal, so defaults, scalar shorthands and field normalisation have
 * exactly one definition — the one scenes already use.
 */
function fromEffect(chain: EffectChain): AnyFilter {
    return chain.list[0] as AnyFilter;
}

/**
 * Immutable, chainable list of media filters — the filters valid on an **image**
 * fill.
 *
 * Each builder method returns a new chain with the filter appended, so chains
 * are safe to share and branch. {@link VideoAdjustmentChain} extends this with the
 * video-only temporal filters; the split is what keeps `posterizeTime` off an
 * image fill, mirroring how `Fill` is structured.
 *
 * @example
 * const chain = Adjustments.blur(4).grayscale(0.5);
 * node.filters = chain; // assign directly
 * node.filters = [...chain, { type: 'alpha', amount: 0.5 }]; // spread into array
 */
export class AdjustmentChain {
    constructor(public list: AnyFilter[] = []) { }

    /**
     * Append `filter`, returning a chain of the same class — so the video
     * subclass keeps its extra builders reachable after an inherited one.
     */
    protected append(filter: AnyFilter): this {
        const Ctor = this.constructor as new (list: AnyFilter[]) => this;
        return new Ctor([...this.list, filter]);
    }

    // -- Filters with no scene-effect counterpart -------------------------

    /** Append a Gaussian blur. */
    blur(options: number | BlurFilterOptions) {
        const { radius } = scalarFilter(options, "radius");
        return this.append({ type: 'blur', radius });
    }

    /** Append a grayscale filter. */
    grayscale(options: number | GrayscaleFilterOptions) {
        const { amount } = scalarFilter(options, "amount");
        return this.append({ type: 'grayscale', amount });
    }

    /** Append an alpha (opacity) filter. */
    alpha(options: number | AlphaFilterOptions) {
        const { amount } = scalarFilter(options, "amount");
        return this.append({ type: 'alpha', amount });
    }

    /** Append an exposure filter. */
    exposure(options: number | ExposureFilterOptions) {
        const { amount } = scalarFilter(options, "amount");
        return this.append({ type: 'exposure', amount });
    }

    /** Append a color-adjustment filter from the given partial settings. */
    colorAdjustment(options: ColorAdjustmentFilterOptions) {
        return this.append({ type: 'colorAdjustment', ...options });
    }

    /** Append a raw 4×5 row-major color matrix (Skia format). */
    colorMatrix(options: number[] | ColorMatrixFilterOptions) {
        const matrix = Array.isArray(options) ? options : options.matrix;
        return this.append({ type: 'colorMatrix', matrix });
    }

    /** Append a curves filter from control `points` ([input, output] pairs). */
    curves(options: CurvesFilterOptions) {
        return this.append({ type: 'curves', points: options.points, channel: options.channel });
    }

    // -- Blur family ------------------------------------------------------

    /** Append a directional (linear) blur, smearing the fill along one axis. */
    directionalBlur(options: AsFilterOptions<number | DirectionalBlurOptions>) {
        return this.append(fromEffect(new EffectChain().directionalBlur(options)));
    }

    /** Append a radial blur — zoom or spin streaks about a centre point. */
    radialBlur(options?: AsFilterOptions<number | RadialBlurOptions>) {
        return this.append(fromEffect(new EffectChain().radialBlur(options)));
    }

    /**
     * Append a progressive blur — a blur that ramps across the fill, for the
     * frosted-toward-one-edge look.
     */
    progressiveBlur(options?: AsFilterOptions<number | ProgressiveBlurOptions>) {
        return this.append(fromEffect(new EffectChain().progressiveBlur(options)));
    }

    /** Append a bloom (glow): bright areas bleed soft light outward. */
    bloom(options?: AsFilterOptions<number | BloomOptions>) {
        return this.append(fromEffect(new EffectChain().bloom(options)));
    }

    /** Append anamorphic streaks off the fill's highlights. */
    streak(options?: AsFilterOptions<number | StreakOptions>) {
        return this.append(fromEffect(new EffectChain().streak(options)));
    }

    /** Append volumetric light rays radiating from the fill's bright areas. */
    godRays(options?: AsFilterOptions<number | GodRaysOptions>) {
        return this.append(fromEffect(new EffectChain().godRays(options)));
    }

    /** Append an unsharp-mask sharpen. */
    sharpen(options?: AsFilterOptions<number | SharpenOptions>) {
        return this.append(fromEffect(new EffectChain().sharpen(options)));
    }

    // -- Colour -----------------------------------------------------------

    /** Append a colour invert (negative). */
    invert(options?: AsFilterOptions<number | InvertOptions>) {
        return this.append(fromEffect(new EffectChain().invert(options)));
    }

    /** Append a vintage / film-look grade (sepia + desaturate + warmth). */
    vintage(options?: AsFilterOptions<number | VintageOptions>) {
        return this.append(fromEffect(new EffectChain().vintage(options)));
    }

    /** Append a duotone map — remap luminance between two colours. */
    duotone(options?: AsFilterOptions<number | DuotoneOptions>) {
        return this.append(fromEffect(new EffectChain().duotone(options)));
    }

    /** Append colour banding: quantize to `levels` tones per channel. */
    posterize(options?: AsFilterOptions<number | PosterizeOptions>) {
        return this.append(fromEffect(new EffectChain().posterize(options)));
    }

    /** Append a hard luminance threshold (1-bit black/white). */
    threshold(options?: AsFilterOptions<number | ThresholdOptions>) {
        return this.append(fromEffect(new EffectChain().threshold(options)));
    }

    /** Append a bit-depth crush, optionally snapping to a hardware palette. */
    bitCrush(options?: AsFilterOptions<number | BitCrushOptions>) {
        return this.append(fromEffect(new EffectChain().bitCrush(options)));
    }

    // -- Texture / pattern ------------------------------------------------

    /**
     * Append ordered (Bayer) dithering — quantize to `levels` tones, hiding the
     * banding in a repeating threshold pattern.
     */
    dither(options?: AsFilterOptions<number | DitherOptions>) {
        return this.append(fromEffect(new EffectChain().dither(options)));
    }

    /** Append a halftone screen — print-style dots (or lines) sized by tone. */
    halftone(options?: AsFilterOptions<number | HalftoneOptions>) {
        return this.append(fromEffect(new EffectChain().halftone(options)));
    }

    /** Append film grain. Animate it by tweening `seed`. */
    grain(options?: AsFilterOptions<number | GrainOptions>) {
        return this.append(fromEffect(new EffectChain().grain(options)));
    }

    /** Append a 3D colour lookup table — see {@link EffectChain.lut}. */
    lut(options: AsFilterOptions<LutOptions>) {
        return this.append(fromEffect(new EffectChain().lut(options as LutOptions)));
    }

    /** Append CRT-style scanlines. */
    scanlines(options?: AsFilterOptions<number | ScanlinesOptions>) {
        return this.append(fromEffect(new EffectChain().scanlines(options)));
    }

    /** Append an After Effects-style Mosaic — `blocks` across the fill. */
    pixelate(options: AsFilterOptions<number | PixelateOptions>) {
        return this.append(fromEffect(new EffectChain().pixelate(options)));
    }

    /**
     * Append Kuwahara "oil paint" brushwork: average within a region, never
     * across an edge, so flat areas smooth into strokes while edges stay crisp.
     *
     * Cost grows with `radius²` — the most expensive filter in the set.
     */
    oilPaint(options?: AsFilterOptions<number | OilPaintOptions>) {
        return this.append(fromEffect(new EffectChain().oilPaint(options)));
    }

    /** Append an ASCII-art remap of the fill through a glyph ramp. */
    ascii(options?: AsFilterOptions<number | AsciiOptions>) {
        return this.append(fromEffect(new EffectChain().ascii(options)));
    }

    /** Append an edge-detect pass (Sobel / Prewitt / Laplacian). */
    edges(options?: AsFilterOptions<number | EdgesOptions>) {
        return this.append(fromEffect(new EffectChain().edges(options)));
    }

    /** Append a darkened border falling off toward the fill's corners. */
    vignette(options?: AsFilterOptions<number | VignetteOptions>) {
        return this.append(fromEffect(new EffectChain().vignette(options)));
    }

    /** Append an overlaid texture image (paper, canvas, noise map). */
    texture(options: AsFilterOptions<TextureOptions>) {
        return this.append(fromEffect(new EffectChain().texture(options)));
    }

    // -- Displacement / lens ----------------------------------------------

    /** Append lens-dispersion colour fringing. */
    chromaticAberration(options?: AsFilterOptions<number | ChromaticAberrationOptions>) {
        return this.append(fromEffect(new EffectChain().chromaticAberration(options)));
    }

    /** Append a hard per-channel RGB offset (the glitchy cousin of the above). */
    rgbShift(options?: AsFilterOptions<number | RgbShiftOptions>) {
        return this.append(fromEffect(new EffectChain().rgbShift(options)));
    }

    /** Append per-pixel random jitter. */
    scatter(options?: AsFilterOptions<number | ScatterOptions>) {
        return this.append(fromEffect(new EffectChain().scatter(options)));
    }

    /** Append horizontal band tearing — the datamosh / bad-signal look. */
    blockDisplace(options?: AsFilterOptions<number | BlockDisplaceOptions>) {
        return this.append(fromEffect(new EffectChain().blockDisplace(options)));
    }

    /** Append a bulge (barrel) or, with a negative strength, a pinch. */
    bulge(options: AsFilterOptions<number | BulgeOptions>) {
        return this.append(fromEffect(new EffectChain().bulge(options)));
    }

    /** Append a twirl (swirl about a centre point). */
    twirl(options?: AsFilterOptions<number | TwirlOptions>) {
        return this.append(fromEffect(new EffectChain().twirl(options)));
    }

    /** Append a sine/triangle/square wave warp. */
    wave(options?: AsFilterOptions<number | WaveOptions>) {
        return this.append(fromEffect(new EffectChain().wave(options)));
    }

    /** Append a kaleidoscope mirror of the fill about a centre point. */
    kaleidoscope(options?: AsFilterOptions<number | KaleidoscopeOptions>) {
        return this.append(fromEffect(new EffectChain().kaleidoscope(options)));
    }

    /** Append a displacement map, pushing pixels by another image's channels. */
    displace(options: AsFilterOptions<DisplaceOptions>) {
        return this.append(fromEffect(new EffectChain().displace(options)));
    }

    /** Append a custom SkSL shader pass over the fill. */
    sksl(options: AsFilterOptions<SkSLOptions>) {
        return this.append(fromEffect(new EffectChain().sksl(options)));
    }

    /** Allows spreading the chain into an array: `[...Adjustments.blur(5)]`. */
    *[Symbol.iterator]() {
        yield* this.list;
    }

    /** Serializes to the raw filter array so frameworks that call `toJSON` get a plain value. */
    toJSON() {
        return this.list;
    }
}

/**
 * An {@link AdjustmentChain} plus the video-only temporal filters — the
 * filters valid on a **video** fill.
 *
 * @example
 * node.filters = VideoAdjustments.posterizeTime(6).grayscale(1);
 */
export class VideoAdjustmentChain extends AdjustmentChain {
    /** Append a posterize-time filter; snaps the video playhead to `fps`. */
    posterizeTime(options: number | PosterizeTimeFilterOptions) {
        const { fps } = scalarFilter(options, "fps");
        return this.append({ type: 'posterizeTime', fps });
    }

    /** Append an echo (motion-trail) filter over the clip's past frames. */
    echo(options: EchoFilterOptions) {
        return this.append({ type: 'echo', ...options });
    }
}

/**
 * Accepted shapes for an **image** fill's `filters` prop — a single pixel
 * filter, a plain array of them, or a filter chain. Mirrors how `Fill` is the
 * loose author-facing union for a fill. Video-only filters are excluded here.
 */
export type ImageAdjustment = MediaAdjustment | MediaAdjustment[] | AdjustmentChain;

/**
 * Accepted shapes for a **video** fill's `filters` prop — the pixel filters
 * plus the video-only temporal filters (`posterizeTime`, `echo`).
 */
export type VideoAdjustment =
    | (MediaAdjustment | VideoOnlyAdjustment)
    | (MediaAdjustment | VideoOnlyAdjustment)[]
    | AdjustmentChain;

/**
 * Entry point for building **image** filter chains fluently.
 *
 * An empty chain, so `Adjustments.blur(8)` is `new AdjustmentChain().blur(8)`
 * — and every builder's signature and documentation has one definition, on
 * {@link AdjustmentChain}, which is what an editor shows on hover.
 *
 * Contains only pixel filters; video-only filters (`posterizeTime`, `echo`)
 * live on {@link VideoAdjustments} because image fills cannot use them.
 *
 * @example
 * node.filters = Adjustments.blur(8).grayscale(1);
 * <Rect fill={Fills.image('bg.jpg', { filters: Adjustments.oilPaint(4) })} />
 */
export const Adjustments = new AdjustmentChain();

/**
 * Entry point for building **video** filter chains fluently — every
 * {@link Adjustments} builder plus the video-only temporal ones.
 *
 * @example
 * node.filters = VideoAdjustments.posterizeTime(6);
 * node.filters = VideoAdjustments.grayscale(1).blur(6);
 */
export const VideoAdjustments = new VideoAdjustmentChain();

/**
 * The previous name for {@link Adjustments}.
 *
 * Kept because a scene is *source code in someone else's project*: a rename that
 * only shows up as a compile error in a file we can't edit is still a rename that
 * broke their build. The alias costs one line and buys a release in which both
 * spellings work.
 *
 * @deprecated Use {@link Adjustments}. Removed in the next major.
 */
export const ImageFilters = Adjustments;

/**
 * The previous name for {@link VideoAdjustments}.
 *
 * @deprecated Use {@link VideoAdjustments}. Removed in the next major.
 */
export const VideoFilters = VideoAdjustments;

/**
 * Normalises any `ImageAdjustment`/`VideoAdjustment` value to a plain filter array.
 * Used internally when reading props before rendering or interpolation.
 */
export function resolveChainAdjustments(filters: ImageAdjustment | VideoAdjustment | undefined): AnyFilter[] {
    if (filters === undefined) return [];
    if (filters instanceof AdjustmentChain) return filters.list;
    if (Array.isArray(filters)) return filters;
    return [filters];
}
