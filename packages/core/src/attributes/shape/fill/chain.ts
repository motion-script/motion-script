import type { Color } from "./color/parser";
import type { BlendMode } from "./blend";
import type { Vector2 } from "@/attributes/layout/vector2";
import type { MediaFilter } from "../filters/union";
import type { FillProp, FillSpace } from "./union";
import type { ImageFillMode, ImageTransform } from "./implementations/image";

/** Author-facing options for a {@link FillChain.video} layer. */
export interface VideoFillOptions extends FillOptions {
    mode?: ImageFillMode;
    transform?: ImageTransform;
    scaling?: number;
    filters?: MediaFilter[];
    /** Starting offset into the source, in seconds. Defaults to `trimStart` (or 0). */
    timestamp?: number;
    /** Whether playback advances each frame. Defaults to `true`. */
    playing?: boolean;
    trimStart?: number;
    trimEnd?: number;
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
 * const bg = Fill.image('./background.jpg', { blend: 'overlay', opacity: 0.2 })
 *                .color('red', { opacity: 0.3 });
 * node.fill = bg;                 // assign directly
 * node.fill = [...bg, 'white'];   // spread into an array
 */
export class FillChain {
    constructor(public list: FillProp[] = []) { }

    /** Append a solid color fill. A CSS string or normalized `[r,g,b,a]`. */
    color(color: Color, options?: FillOptions) {
        return new FillChain([...this.list, withOptions({ type: 'color' as const, color }, options)]);
    }

    /** Append an image fill from `src`. */
    image(src: string, options?: FillOptions & { mode?: ImageFillMode; transform?: ImageTransform; scaling?: number; filters?: MediaFilter[] }) {
        const { mode, transform, scaling, filters, ...common } = options ?? {};
        return new FillChain([...this.list, withOptions({ type: 'image' as const, src, mode, transform, scaling, filters }, common)]);
    }

    /** Append a video fill from `src`. Plays by default, advancing its timestamp each frame. */
    video(src: string, options?: VideoFillOptions) {
        const { mode, transform, scaling, filters, timestamp, playing, trimStart, trimEnd, speed, loop, duration, ...common } = options ?? {};
        return new FillChain([...this.list, withOptions({
            type: 'video' as const,
            src,
            mode, transform, scaling, filters,
            timestamp: timestamp ?? trimStart ?? 0,
            playing: playing ?? true,
            trimStart, trimEnd, speed, loop, duration,
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

    /** Append a noise fill. */
    noise(options?: FillOptions & { size?: Vector2; density?: number; color?: Color }) {
        const { size, density, color, ...common } = options ?? {};
        return new FillChain([...this.list, withOptions({ type: 'noise' as const, size, density, color }, common)]);
    }

    /** Append a stripe (hatch) fill. */
    stripe(options?: FillOptions & { gap?: number; strokeWidth?: number; angle?: number; color?: Color }) {
        const { gap, strokeWidth, angle, color, ...common } = options ?? {};
        return new FillChain([...this.list, withOptions({ type: 'stripe' as const, gap, strokeWidth, angle, color }, common)]);
    }

    /** Allows spreading the chain into an array: `[...Fill.color('red')]`. */
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
 * Can be a single fill, a `FillChain` builder result, or an array mixing
 * plain fills with chains (each chain contributes all its layers in place):
 *
 *   Fill.image('bg.jpg')
 *   ['#e8c584', Fill.image('bg.jpg')]
 *   ['#e8c584', ...Fill.image('bg.jpg')]
 */
export type ChainableFill = FillProp | FillChain | (FillProp | FillChain)[];

/**
 * Entry points for building fill chains fluently.
 *
 * @example
 * node.fill = Fill.image('./bg.jpg', { opacity: 0.2 }).color('red', { opacity: 0.3 });
 */
export const Fill = {
    color: (color: Color, options?: FillOptions) =>
        new FillChain().color(color, options),
    image: (src: string, options?: FillOptions & { mode?: ImageFillMode; transform?: ImageTransform; scaling?: number; filters?: MediaFilter[] }) =>
        new FillChain().image(src, options),
    video: (src: string, options?: VideoFillOptions) =>
        new FillChain().video(src, options),

    linearGradient: (colors: Color[], options?: Parameters<FillChain['linearGradient']>[1]) =>
        new FillChain().linearGradient(colors, options),
    radialGradient: (colors: Color[], options?: Parameters<FillChain['radialGradient']>[1]) =>
        new FillChain().radialGradient(colors, options),
    conicGradient: (colors: Color[], options?: Parameters<FillChain['conicGradient']>[1]) =>
        new FillChain().conicGradient(colors, options),
    noise: (options?: Parameters<FillChain['noise']>[0]) =>
        new FillChain().noise(options),
    stripe: (options?: Parameters<FillChain['stripe']>[0]) =>
        new FillChain().stripe(options),
};

/**
 * Normalises any `ChainableFill` value to a plain `FillProp[]`.
 * Used by `resolveFillArray` before resolving to the renderer shape.
 */
export function resolveChainFill(fill: ChainableFill | undefined): FillProp[] {
    if (fill == null) return [];
    if (fill instanceof FillChain) return fill.list;
    if (Array.isArray(fill)) {
        // Flatten any chains used as array elements so each contributes its
        // layers in place: `['#e8c584', Fill.image('bg.jpg')]`.
        const out: FillProp[] = [];
        for (const item of fill) {
            if (item instanceof FillChain) out.push(...item.list);
            else out.push(item);
        }
        return out;
    }
    return [fill];
}
