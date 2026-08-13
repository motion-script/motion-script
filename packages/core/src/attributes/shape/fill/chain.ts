import type { Color } from "./color/parser";
import type { BlendMode } from "./blend";
import type { Vector2 } from "@/attributes/layout/vector2";
import { resolveChainFilters } from "../filters/chain";
import type { ImageFilter, VideoFilter } from "../filters/chain";
import type { MediaFilter } from "../filters/union";
import type { FillProp, FillResolved, FillSpace } from "./union";
import type { ImageCrop, ImageFit, ImageMatrix } from "./implementations/image";
import type { Anchor } from "@/attributes/layout/anchor";
import type { FractalNoiseFillProp } from "./implementations/fractal-noise";
import type { ShaderFillProp } from "./implementations/shader";
import type { Graphics3D } from "@/render3d/graphics3d";

/** Placement options shared by the image and video fill builders. */
export interface MediaPlacementOptions {
    /** How the (cropped) source is scaled into the node's bounds. Default `'fill'`. */
    fit?: ImageFit;
    /** Window onto the source, in fractions of its own size, applied before `fit`. */
    crop?: ImageCrop;
    /** Magnification on top of the fitted scale. `1` is the fitted size. */
    zoom?: number;
    /** The point held fixed as `zoom` scales; also the alignment when it doesn't cover. */
    anchor?: Anchor;
    /** Raw source→shape matrix; bypasses `crop`/`fit`/`zoom`/`anchor` and the bounds. */
    matrix?: ImageMatrix;
}

/** Author-facing options for a {@link FillChain.video} layer. */
export interface VideoFillOptions extends FillOptions, MediaPlacementOptions {
    filters?: VideoFilter;
    /**
     * Explicit source time to paint, in seconds. Omit it and the clip plays by
     * itself, timed from the moment the node painting it appeared — set it only
     * to drive the playhead yourself (`null` hands the playhead back).
     */
    timestamp?: number | null;
    /** Whether playback advances with the node's clock. Defaults to `true`. */
    playing?: boolean;
    trimStart?: number;
    trimEnd?: number;
    /** Seconds after the painting node appears before playback begins. Default `0`. */
    playStart?: number;
    speed?: number;
    loop?: 'forward' | 'reverse' | 'none';
    duration?: number;
}

/**
 * Cross-cutting options shared by every fill layer. These map onto the
 * `opacity` / `blend` fields each fill prop already accepts, plus the
 * `space` directive carried generically by the registry.
 */
export interface FillOptions {
    opacity?: number;
    blend?: BlendMode;
    space?: FillSpace;
}

/** Strip `undefined` option keys so the produced props stay minimal/comparable. */
function withOptions<T extends object>(base: T, options: FillOptions = {}): T & FillOptions {
    const out = { ...base } as T & FillOptions;
    if (options.opacity !== undefined) out.opacity = options.opacity;
    if (options.blend !== undefined) out.blend = options.blend;
    if (options.space !== undefined) out.space = options.space;
    return out;
}

/**
 * Immutable, chainable list of fill layers.
 *
 * Each builder method returns a new `FillChain` with the layer appended, so
 * chains are safe to share and branch — mirroring {@link EffectChain}.
 *
 * @example
 * const bg = Fills.image('./background.jpg', { blend: 'overlay', opacity: 0.2 })
 *                 .color('red', { opacity: 0.3 });
 * node.fill = bg;                 // assign directly
 * node.fill = [...bg, 'white'];   // spread into an array
 */
export class FillChain {
    constructor(public list: FillProp[] = []) { }

    /** Append a solid color fill. A CSS string or normalized `[r,g,b,a]`. */
    color(color: Color, options?: FillOptions) {
        return new FillChain([...this.list, withOptions({ type: 'solid' as const, color }, options)]);
    }

    /**
     * Append an image fill from `src`.
     *
     * @example
     * Fills.image('./city.jpg', { zoom: 1.4, anchor: 'topCenter', crop: { bottom: 0.2 } })
     */
    image(src: string, options?: FillOptions & MediaPlacementOptions & { filters?: ImageFilter }) {
        const { fit, crop, zoom, anchor, matrix, filters, ...common } = options ?? {};
        // `ImageFilter` admits only pixel filters, so the resolved array is safely
        // a `MediaFilter[]` for the image prop (video-only filters can't reach here).
        const imageFilters = filters ? (resolveChainFilters(filters) as MediaFilter[]) : undefined;
        return new FillChain([...this.list, withOptions({
            type: 'image' as const,
            src,
            fit, crop, zoom, anchor, matrix,
            filters: imageFilters,
        }, common)]);
    }

    /**
     * Append a video fill from `src`. Plays by default: its source timestamp is
     * derived as it paints, from how long the node carrying the fill has
     * existed — so the clip runs wherever the fill is used (fill, overlay,
     * stroke, shadow, a custom node's `Graphics`) with nothing to advance.
     */
    video(src: string, options?: VideoFillOptions) {
        const { fit, crop, zoom, anchor, matrix, filters, timestamp, playing, trimStart, trimEnd, playStart, speed, loop, duration, ...common } = options ?? {};
        return new FillChain([...this.list, withOptions({
            type: 'video' as const,
            src,
            fit, crop, zoom, anchor, matrix, filters: filters && resolveChainFilters(filters),
            timestamp,
            playing: playing ?? true,
            trimStart, trimEnd, playStart, speed, loop, duration,
        }, common)]);
    }


    /** Append a linear gradient between `colors`. */
    linearGradient(colors: Color[], options?: FillOptions & { stops?: number[]; start?: Vector2; end?: Vector2 }) {
        const { stops, start, end, ...common } = options ?? {};
        return new FillChain([...this.list, withOptions({ type: 'linear-gradient' as const, colors, stops, start, end }, common)]);
    }

    /** Append a radial gradient between `colors`. */
    radialGradient(colors: Color[], options?: FillOptions & { stops?: number[]; center?: Vector2; radius?: number }) {
        const { stops, center, radius, ...common } = options ?? {};
        return new FillChain([...this.list, withOptions({ type: 'radial-gradient' as const, colors, stops, center, radius }, common)]);
    }

    /** Append a conic gradient between `colors`. */
    conicGradient(colors: Color[], options?: FillOptions & { stops?: number[]; center?: Vector2; startAngle?: number }) {
        const { stops, center, startAngle, ...common } = options ?? {};
        return new FillChain([...this.list, withOptions({ type: 'conic-gradient' as const, colors, stops, center, startAngle }, common)]);
    }

    /** Append a noise (speckle) fill. Tween `seed` to make the static crawl. */
    noise(options?: FillOptions & { size?: Vector2; density?: number; color?: Color; seed?: number }) {
        const { size, density, color, seed, ...common } = options ?? {};
        return new FillChain([...this.list, withOptions({ type: 'noise' as const, size, density, color, seed }, common)]);
    }

    /**
     * Append a fractal (fBm) noise fill — a continuous field rather than the
     * speckle {@link noise} paints. Cloud, marble, smoke, terrain, plasma.
     *
     * Tween `offset` to travel through the field (it flows); tween `seed` to
     * shift to a different field entirely (it churns).
     */
    fractalNoise(options?: FillOptions & Omit<FractalNoiseFillProp, 'type' | 'opacity' | 'blend'>) {
        const {
            basis, octaves, frequency, lacunarity, gain, seed, offset, angle,
            colors, stops, contrast, ...common
        } = options ?? {};
        return new FillChain([...this.list, withOptions(
            {
                type: 'fractalNoise' as const,
                basis, octaves, frequency, lacunarity, gain, seed, offset, angle,
                colors, stops, contrast,
            },
            common,
        )]);
    }

    /**
     * Append a custom SkSL shader fill — the escape hatch past {@link noise} and
     * {@link fractalNoise}, where the author writes the fragment function.
     *
     * `source` must declare `vec4 main(vec2 fragCoord)` and return
     * **premultiplied** rgba, without folding `opacity` in (the layer's opacity is
     * already on the paint, so applying it twice squares it). Uniforms are keyed
     * by their declared name and bound by reflecting the compiled program, so
     * order is irrelevant; the renderer supplies `u_size`, `u_origin`,
     * `u_resolution`, `u_aspect`, `u_time` and `u_scale` to whichever of them the
     * source declares.
     *
     * Keep `source` constant — it is the compile-cache key, so it snaps at a
     * tween's midpoint and rebuilding it per frame compiles a program per frame.
     * Everything that changes belongs in a uniform, which is an in-place write.
     *
     * @example
     * Fills.shader(GLOW, { uniforms: { u_amount: 0.6 }, coords: 'centered' })
     */
    shader(source: string, options?: FillOptions & Omit<ShaderFillProp, 'type' | 'source' | 'opacity' | 'blend'>) {
        const { uniforms, coords, textures, ...common } = options ?? {};
        return new FillChain([...this.list, withOptions(
            { type: 'shader' as const, source, uniforms, coords, textures },
            common,
        )]);
    }

    /** Append a stripe (hatch) fill. */
    stripe(options?: FillOptions & { gap?: number; strokeWidth?: number; angle?: number; color?: Color }) {
        const { gap, strokeWidth, angle, color, ...common } = options ?? {};
        return new FillChain([...this.list, withOptions({ type: 'stripe' as const, gap, strokeWidth, angle, color }, common)]);
    }

    /**
     * Append a 3D scene, painted through the shape's own path.
     *
     * Takes a **built** {@link Graphics3D}, never a builder — per-frame freshness
     * comes from where the value is produced (a `renderSelf`, or a `() => …`
     * reactive binding), like every other fill.
     *
     * Note two same-type 3D layers hard-cut rather than cross-fading, because a
     * command list has no meaningful in-between. To dissolve between two scenes,
     * stack them and tween their opacities in opposite directions.
     */
    view3D(graphics3D: Graphics3D, options?: FillOptions & { maxPixelRatio?: number; antialias?: boolean }) {
        const { maxPixelRatio, antialias, ...common } = options ?? {};
        return new FillChain([...this.list, withOptions({ type: 'view3D' as const, graphics3D, maxPixelRatio, antialias }, common)]);
    }

    /** Allows spreading the chain into an array: `[...Fills.color('red')]`. */
    *[Symbol.iterator]() {
        yield* this.list;
    }

    /** Serializes to the raw fill array so frameworks that call `toJSON` get a plain value. */
    toJSON() {
        return this.list;
    }
}

/**
 * Accepted shapes for a node's `fill` prop.
 *
 * Can be a single fill, a `FillChain` builder result, an already-resolved
 * {@link FillResolved}, or an array mixing any of these (each chain contributes
 * all its layers in place):
 *
 *   'red'                                  // plain CSS color
 *   Fills.image('bg.jpg')                  // chain
 *   ['#e8c584', Fills.image('bg.jpg')]
 *   ['#e8c584', ...Fills.image('bg.jpg')]
 *   resolvedFills                          // FillResolved[] passes through
 */
export type Fill =
    | FillProp
    | FillResolved
    | FillChain
    | (FillProp | FillResolved | FillChain)[];

/**
 * Entry point for building fill chains fluently.
 *
 * An empty {@link FillChain}, so `Fills.image(src)` *is* `new FillChain().image(src)`
 * — every builder's signature and documentation has one definition, on the
 * class, which is what an editor shows when you hover `Fills.image`. The chain
 * is immutable (each builder returns a new one), so sharing one empty instance
 * as the entry point is safe.
 *
 * @example
 * node.fill = Fills.image('./bg.jpg', { opacity: 0.2 }).color('red', { opacity: 0.3 });
 */
export const Fills = new FillChain();

/**
 * Normalises any {@link Fill} value to a plain `FillProp[]`.
 * Used by `resolveFillArray` before resolving to the renderer shape.
 *
 * Already-resolved fills (`FillResolved`) structurally satisfy `FillProp`, so
 * they pass straight through and `resolveFill` re-normalises them idempotently.
 */
export function resolveChainFill(fill: Fill | undefined): FillProp[] {
    if (fill == null) return [];
    if (fill instanceof FillChain) return fill.list;
    if (Array.isArray(fill)) {
        // Flatten any chains used as array elements so each contributes its
        // layers in place: `['#e8c584', Fills.image('bg.jpg')]`.
        const out: FillProp[] = [];
        for (const item of fill) {
            if (item instanceof FillChain) out.push(...item.list);
            else out.push(item as FillProp);
        }
        return out;
    }
    return [fill as FillProp];
}
