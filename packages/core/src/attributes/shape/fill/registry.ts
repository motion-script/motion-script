import { AssetTracker } from "@/assets/tracker";
import { AssetCatalog } from "@/assets/catalog";
import { FillProp, FillResolved, FillSpace } from "./union";
import { Fill, resolveChainFill } from "./chain";
import { canCoerce, coercePair } from "./coerce";

import { colorFill } from "./implementations/color";
import { linearGradientFill } from "./implementations/linear-gradient";
import { radialGradientFill } from "./implementations/radial-gradient";
import { conicGradientFill } from "./implementations/conic-gradient";
import { noiseFill } from "./implementations/noise";
import { stripeFill } from "./implementations/stripe";
import { imageFill } from "./implementations/image";
import { videoFill } from "./implementations/video";

type FillResult<T extends FillResolved> = Omit<Omit<T, "type">, "blend">;

export interface FillData<T extends FillResolved> {
    resolve(prop: any): T;
    equals(a: T, b: T): boolean;
    lerp(from: FillResult<T>, to: FillResult<T>, t: number): FillResult<T>;
    update(previous: FillResult<T>, globalTime: number, assets: AssetCatalog): FillResult<T>;
    prepare?(fill: T, registry: AssetTracker, width: number, height: number): void;
    /**
     * True when `update()` is time-dependent and must run every frame (e.g.
     * video, which advances its timestamp). Static fills (solid, gradients,
     * noise, image) have an identity `update` and can be skipped each frame.
     */
    dynamic?: boolean;
}

const FILLS = new Map<string, FillData<FillResolved>>([
    ["color", colorFill as FillData<FillResolved>],
    ["linear-gradient", linearGradientFill as FillData<FillResolved>],
    ["radial-gradient", radialGradientFill as FillData<FillResolved>],
    ["conic-gradient", conicGradientFill as FillData<FillResolved>],
    ["noise", noiseFill as FillData<FillResolved>],
    ["stripe", stripeFill as FillData<FillResolved>],
    ["image", imageFill as FillData<FillResolved>],
    ["video", videoFill as FillData<FillResolved>],
]);

function get(name: string): FillData<FillResolved> {
    const data = FILLS.get(name);
    if (!data) throw new Error(`Fill "${name}" is not registered`);
    return data;
}

export function resolveFill(prop: FillProp): FillResolved {
    if (typeof prop === "string") return resolveFill({ type: "color", color: prop });
    const resolved = get(prop.type).resolve(prop);
    // `space` is a cross-cutting rendering directive (like `blend`); carry it
    // through generically so each fill `resolve()` doesn't have to know about it.
    const space = (prop as { space?: FillSpace }).space;
    return space !== undefined ? { ...resolved, space } : resolved;
}

export function resolveFillArray(prop: Fill | undefined): FillResolved[] {
    return resolveChainFill(prop).map(resolveFill);
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

export function lerpFillArray(from: FillResolved[], to: FillResolved[], t: number): FillResolved[] {
    if (from === to) return from;
    if (!from.length && !to.length) return [];
    const maxLength = Math.max(from.length, to.length);
    const result: FillResolved[] = [];
    for (let i = 0; i < maxLength; i++) {
        const f = from[i];
        const tf = to[i];
        if (f && tf) {
            result.push(lerpFill(f, tf, t));
        } else if (f) {
            result.push(lerpFill(f, { ...f, opacity: 0 }, t));
        } else if (tf) {
            result.push(lerpFill({ ...tf, opacity: 0 }, tf, t));
        }
    }
    return result;
}

export function updateFill(fill: FillResolved, globalTime: number, assets: AssetCatalog): FillResolved {
    if (!FILLS.has(fill.type)) return fill;
    return { ...fill, ...get(fill.type).update(fill, globalTime, assets) };
}

/** True if any fill in the array is time-dependent and needs a per-frame update. */
export function hasDynamicFill(fills: FillResolved[]): boolean {
    for (let i = 0; i < fills.length; i++) {
        if (FILLS.get(fills[i].type)?.dynamic) return true;
    }
    return false;
}

export function prepareFill(fill: FillResolved, tracker: AssetTracker, width: number, height: number): void {
    FILLS.get(fill.type)?.prepare?.(fill, tracker, width, height);
}
