import { AssetTracker } from "@/assets/tracker";
import { FillProp, FillResolved, FillSpace } from "./union";
import { Fill, resolveChainFill } from "./chain";
import { canCoerce, coercePair } from "./coerce";

import { colorFill } from "./implementations/color";
import { linearGradientFill } from "./implementations/linear-gradient";
import { radialGradientFill } from "./implementations/radial-gradient";
import { conicGradientFill } from "./implementations/conic-gradient";
import { noiseFill } from "./implementations/noise";
import { fractalNoiseFill } from "./implementations/fractal-noise";
import { stripeFill } from "./implementations/stripe";
import { shaderFill } from "./implementations/shader";
import { imageFill } from "./implementations/image";
import { videoFill } from "./implementations/video";
import { view3DFill } from "./implementations/view3d";
// The one value import from `render3d` into the fill layer, for the bare-scene
// coercion in `resolveFill`. Acyclic: `render3d` only imports `Color` back from
// here, and does so type-only.
import { Graphics3D } from "@/render3d/graphics3d";

type FillResult<T extends FillResolved> = Omit<Omit<T, "type">, "blend">;

export interface FillData<T extends FillResolved> {
    resolve(prop: any): T;
    equals(a: T, b: T): boolean;
    lerp(from: FillResult<T>, to: FillResult<T>, t: number): FillResult<T>;
    prepare?(fill: T, registry: AssetTracker, width: number, height: number): void;
}

const FILLS = new Map<string, FillData<FillResolved>>([
    ["solid", colorFill as FillData<FillResolved>],
    ["linear-gradient", linearGradientFill as FillData<FillResolved>],
    ["radial-gradient", radialGradientFill as FillData<FillResolved>],
    ["conic-gradient", conicGradientFill as FillData<FillResolved>],
    ["noise", noiseFill as FillData<FillResolved>],
    ["fractalNoise", fractalNoiseFill as FillData<FillResolved>],
    ["stripe", stripeFill as FillData<FillResolved>],
    ["shader", shaderFill as FillData<FillResolved>],
    ["image", imageFill as FillData<FillResolved>],
    ["video", videoFill as FillData<FillResolved>],
    ["view3D", view3DFill as FillData<FillResolved>],
]);

function get(name: string): FillData<FillResolved> {
    const data = FILLS.get(name);
    if (!data) throw new Error(`Fill "${name}" is not registered`);
    return data;
}

export function resolveFill(prop: FillProp): FillResolved {
    if (typeof prop === "string") return resolveFill({ type: "solid", color: prop });
    // A bare built scene is shorthand for a 3D fill, the same way a bare CSS
    // string is shorthand for a solid one.
    if (prop instanceof Graphics3D) return resolveFill({ type: "view3D", graphics3D: prop });
    const resolved = get(prop.type).resolve(prop);
    // `space` is a cross-cutting rendering directive (like `blend`); carry it
    // through generically so each fill `resolve()` doesn't have to know about it.
    const space = (prop as { space?: FillSpace }).space;
    return space !== undefined ? { ...resolved, space } : resolved;
}

export function resolveFillArray(prop: Fill | undefined): FillResolved[] {
    return resolveChainFill(prop).map(resolveFill);
}

/**
 * True when `a` and `b` can be interpolated into a single fill by {@link
 * lerpFill} without throwing — i.e. they share a type with the same `blend`, or
 * they're a color/gradient pair {@link canCoerce} can promote to one type.
 *
 * Pairs that fail this (e.g. color↔image, image↔video, or same-type fills with
 * differing blend modes) have no meaningful single-type in-between; {@link
 * lerpFillArray} cross-fades them as two stacked layers instead.
 */
export function canLerpFill(a: FillResolved, b: FillResolved): boolean {
    if (a.type === b.type) return a.blend === b.blend;
    return canCoerce(a, b);
}

export function lerpFill(a: FillResolved, b: FillResolved, t: number): FillResolved {
    const clamped = Math.min(1, Math.max(0, t));

    // Cross-type tween (color↔gradient, or gradient↔gradient of different
    // kinds): promote both endpoints to a common type, then lerp with that
    // type's lerp. blend cannot interpolate, so it snaps with the rest of the
    // coerced shape.
    if (a.type !== b.type) {
        if (!canCoerce(a, b)) {
            throw new Error(`No registered lerp for fills of type "${a.type}" and "${b.type}"`);
        }
        const [ca, cb] = coercePair(a, b);
        return { ...ca, ...get(ca.type).lerp(ca, cb, clamped) };
    }

    if (a.blend !== b.blend) {
        throw new Error(`No registered lerp for fills of type "${a.type}" and "${b.type}"`);
    }
    return { ...a, ...get(a.type).lerp(a, b, clamped) };
}

/** Returns `fill` with its effective opacity scaled by `factor` (clamped to ≥0). */
function scaleOpacity(fill: FillResolved, factor: number): FillResolved {
    return { ...fill, opacity: (fill.opacity ?? 1) * Math.max(0, factor) };
}

export function lerpFillArray(from: FillResolved[], to: FillResolved[], t: number): FillResolved[] {
    if (from === to) return from;
    if (!from.length && !to.length) return [];
    const clamped = Math.min(1, Math.max(0, t));
    const maxLength = Math.max(from.length, to.length);
    const result: FillResolved[] = [];
    for (let i = 0; i < maxLength; i++) {
        const f = from[i];
        const tf = to[i];
        if (f && tf) {
            // Interpolate in place when the two fills share an interpolatable
            // shape (same type, or a coercible color/gradient pair). When they
            // don't (e.g. color↔image, image↔video) there is no single-type
            // in-between, so cross-fade instead: paint the outgoing fill fading
            // out beneath the incoming fill fading in. The dropped-out endpoints
            // are omitted so a static array of one fill stays a single layer.
            if (canLerpFill(f, tf)) {
                result.push(lerpFill(f, tf, clamped));
            } else {
                if (clamped < 1) result.push(scaleOpacity(f, 1 - clamped));
                if (clamped > 0) result.push(scaleOpacity(tf, clamped));
            }
        } else if (f) {
            result.push(lerpFill(f, { ...f, opacity: 0 }, clamped));
        } else if (tf) {
            result.push(lerpFill({ ...tf, opacity: 0 }, tf, clamped));
        }
    }
    return result;
}

export function prepareFill(fill: FillResolved, tracker: AssetTracker, width: number, height: number): void {
    FILLS.get(fill.type)?.prepare?.(fill, tracker, width, height);
}
