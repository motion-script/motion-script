import type { Vector2 } from "@/attributes/layout/vector2";
import type { AssetTracker } from "@/assets/tracker";
import type { Color, NormalizedColor } from "../fill/color/parser";
import { parseColor } from "../fill/color/parser";

/**
 * Which layer an effect runs on: the node's own content (`"foreground"`, the
 * default) or the **backdrop** — the content already painted beneath the node.
 * A backdrop effect is applied to whatever lies underneath the node and clipped
 * to the node's silhouette, so the node's own edges stay sharp (Figma-style).
 */
export type EffectMode = "foreground" | "backdrop";

/**
 * How a backend must realise an effect.
 *
 * - `"filter"` (the default) — the effect transforms colours in place, so it
 *   composes as a plain image filter alongside its neighbours in the chain.
 * - `"shader"` — the effect *resamples pixel positions* (warps, bands, or
 *   otherwise reads neighbouring texels), so it needs the content snapshotted
 *   into a texture and redrawn through a lens rather than composed.
 *
 * This is a statement about the effect, not about any particular backend: it
 * says the effect needs random access to its source, which is why it belongs
 * here next to `lerp`/`equals` rather than in the renderer.
 */
export type EffectSurface = "filter" | "shader";

/**
 * Axis (or axes) an effect acts along.
 *
 * `"both"` (= `{ x: 1, y: 1 }`) uses the full 2D vector; `"x"`/`"y"` isolate a
 * single axis; a {@link Vector2} gives fractional control per axis. Shared by
 * every axis-selecting effect so `scatter` and `motionBlur` speak the same
 * vocabulary.
 */
export type EffectAxis = "x" | "y" | "both" | Vector2;

/** Resolve an {@link EffectAxis} to its per-axis scale vector. */
export function resolveEffectAxis(axis: EffectAxis): Vector2 {
    switch (axis) {
        case "x": return { x: 1, y: 0 };
        case "y": return { x: 0, y: 1 };
        case "both": return { x: 1, y: 1 };
        default: return { x: axis.x, y: axis.y };
    }
}

/** Do two {@link EffectAxis} values resolve to the same scale vector? */
export function sameEffectAxis(a: EffectAxis, b: EffectAxis): boolean {
    const av = resolveEffectAxis(a);
    const bv = resolveEffectAxis(b);
    return av.x === bv.x && av.y === bv.y;
}

/**
 * Resolve a colour-valued effect option to its RGBA tuple.
 *
 * Colour options are stored **as authored** (a CSS string, a theme alias, or an
 * already-normalised tuple) rather than parsed at build time, so a raw effect
 * literal — `{ type: 'outline', color: 'primary', … }` — behaves exactly like the
 * builder form, and a theme alias still resolves against whatever `setTheme`
 * installed. Backends call this to get numbers; `lerp` calls it on both ends.
 */
export function resolveEffectColor(color: Color): NormalizedColor {
    return Array.isArray(color) ? color : parseColor(color);
}

/** Do two colour options resolve to the same RGBA? (`'red'` === `'#ff0000'`.) */
export function sameEffectColor(a: Color, b: Color): boolean {
    if (a === b) return true;
    const av = resolveEffectColor(a);
    const bv = resolveEffectColor(b);
    return av[0] === bv[0] && av[1] === bv[1] && av[2] === bv[2] && av[3] === bv[3];
}

/**
 * Mixin: every effect declares the layer it targets via {@link EffectMode}.
 * Omitted is treated as `"foreground"`. A single uniform field across all effects
 * means the backdrop/foreground classifier never has to branch on `type`.
 */
export interface ModedEffect {
    mode?: EffectMode;
}

/**
 * Cross-cutting options accepted by every effect builder — the builder-side view
 * of {@link ModedEffect}. Each builder's own options type intersects this, so
 * `mode` is spelled the same way everywhere:
 *
 *     Effects.blur({ radius: 8, mode: 'backdrop' })
 *
 * This is the extension point for future chain-wide options (e.g. a wet/dry
 * `mix`): add the field here and to {@link EFFECT_OPTION_KEYS} and every builder
 * picks it up.
 */
export type EffectOptions = ModedEffect;

/**
 * The {@link EffectOptions} keys {@link withEffectOptions} copies onto a built
 * effect. `satisfies` keeps this in lockstep with the interface (mirroring
 * `TEXT_STYLE_KEYS`), and `withEffectOptions` iterates it rather than naming
 * fields, so adding an option here is the only edit needed.
 */
export const EFFECT_OPTION_KEYS = ["mode"] as const satisfies readonly (keyof EffectOptions)[];

/**
 * Merge cross-cutting options onto a built effect, **skipping undefined keys**.
 *
 * Omitting rather than writing `undefined` matters: the per-effect `equals()`
 * implementations compare `mode` directly, so a spread that sets `mode:
 * undefined` is not equal to an effect that never set it at all.
 */
export function withEffectOptions<T extends object>(base: T, options?: EffectOptions): T & EffectOptions {
    const out = { ...base } as T & EffectOptions;
    if (!options) return out;
    for (const key of EFFECT_OPTION_KEYS) {
        const value = options[key];
        if (value !== undefined) out[key] = value;
    }
    return out;
}

/**
 * Normalise a builder's single argument to its options object.
 *
 * Every effect builder takes exactly one parameter; those with a dominant
 * animated scalar also accept that scalar directly, so `blur(8)` and
 * `blur({ radius: 8 })` produce the same effect. `key` names the field a bare
 * number maps onto.
 */
export function scalarOptions<O extends object>(
    arg: number | O | undefined,
    key: keyof O,
): Partial<O> & EffectOptions {
    if (arg === undefined) return {};
    if (typeof arg === "number") return { [key]: arg } as Partial<O> & EffectOptions;
    return arg;
}

export interface EffectData<T> {
    /**
     * Linearly interpolates between two effect states.
     * @param from The starting state of the effect.
     * @param to The target state of the effect.
     * @param t The interpolation factor (usually a normalized value between 0 and 1).
     * @returns A new effect state representing the blended value.
     */
    lerp: (from: T, to: T, t: number) => T;

    /**
     * Compares two effect states for deep equality.
     * @param a The first effect state.
     * @param b The second effect state.
     * @returns True if the effects are structurally identical, otherwise false.
     */
    equals: (a: T, b: T) => boolean;

    /**
     * How a backend must realise this effect. Defaults to `"filter"`; effects
     * that resample pixel positions declare `"shader"`. Drives which render path
     * the effect takes — see {@link EffectSurface}.
     *
     * A predicate handles effects whose surface depends on their own fields —
     * a foreground `sksl` overlay composes as a filter, while the same effect in
     * backdrop mode resamples what is beneath it.
     */
    surface?: EffectSurface | ((effect: T) => EffectSurface);

    /**
     * Declare any assets this effect needs at the current frame, so they are
     * loaded before it renders.
     *
     * The mirror of `FillData.prepare` — an image fill calls
     * `tracker.requestImage(src, …)` here, and an effect that samples a texture
     * does exactly the same. Without it the asset is never requested and the
     * backend's synchronous lookup returns nothing, which the effect can only
     * interpret as "no texture".
     *
     * `width`/`height` are the node's box in logical px, the size hint the
     * loader rasterises SVGs and downsamples large images against.
     */
    prepare?(effect: T, tracker: AssetTracker, width: number, height: number): void;
}
