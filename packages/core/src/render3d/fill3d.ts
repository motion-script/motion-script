import { type Color, type NormalizedColor, parseColor } from "@/attributes/shape/fill/color/parser";
import { lerpColor } from "@/attributes/shape/fill/lerp";
import type { Fill } from "@/attributes/shape/fill/chain";
// A value import, unlike the type-only ones in `texture.ts`: building the rect a
// fill chain is painted into needs the recorder itself. Safe because
// `render/graphics2d` reaches only the *effects* chain at runtime, never back
// into `render3d` — see the note on `SurfaceSource3D`.
import { Graphics2D } from "@/render/graphics2d";
import type { SurfaceSource3D, Texture3D } from "./texture";

/**
 * What a surface is made of.
 *
 * The same value a 2D `fill` takes, so a mesh and a rect are described with one
 * vocabulary: a colour, a gradient, an image, a video, a noise field, a whole
 * stack of blended layers — and, because a `Node2D` subtree and a built
 * `Graphics2D` are fills too, any 2D content at all.
 *
 * This is the 3D counterpart of Spline's material *stack*, built on the fill
 * chain that already exists rather than on a second set of layer types. What it
 * replaces is a flat `color` plus five separate texture slots (`map`,
 * `emissiveMap`, `alphaMap`, `envMap`, `lightMap`), each of which was a fill
 * wearing a different name.
 */
export type Fill3D = Color | Fill | Texture3D | SurfaceSource3D;

/** What a {@link Fill3D} contributes to a material descriptor. */
export interface ResolvedFill3D {
    color?: Color;
    map?: Texture3D;
}

/** Sizing for the buffer a rich fill is rasterized into. */
export interface Fill3DOptions {
    /** Default 512. */
    width?: number;
    /** Default 512. */
    height?: number;
}

const DEFAULT_SIZE = 512;

/**
 * Resolve a {@link Fill3D} into the material fields it describes.
 *
 * Three outcomes, and which one applies is decided by what the fill *is* rather
 * than by an author picking a slot:
 *
 * - **A colour** stays a colour. `fill="tomato"` writes `material.color`, costs
 *   nothing, and is by far the common case — so it must not be the one that
 *   allocates a texture.
 * - **A texture** (an asset path, or any `Texture3D` descriptor) becomes `map`.
 * - **Anything richer** — a gradient, a layer stack, a `Node2D` subtree, a built
 *   `Graphics2D`, a nested `Scene3D` — is painted into an offscreen buffer and
 *   bound as `map`, through exactly the `Tex.surface` machinery that already
 *   existed for putting 2D content on geometry.
 *
 * That last arm is what makes the 2D and 3D fill vocabularies genuinely one
 * thing: `Fills.canvas3D(scene)` inside a chain renders 3D into a layer of a
 * material on a mesh, with no new code path, because the 2D fill renderer was
 * already able to do it.
 */
export function resolveFill3D(
    fill: Fill3D | undefined,
    options: Fill3DOptions = {},
): ResolvedFill3D {
    if (fill === undefined || fill === null) return {};

    if (typeof fill === "string") {
        // A bare string is ambiguous between a colour and an asset path, and both
        // are things authors write. Resolved the way the material handler already
        // resolved a `color` that looked like a file — so this is the existing
        // rule moved somewhere it can be stated once.
        return looksLikeAssetPath(fill) ? { map: fill } : { color: fill };
    }

    if (Array.isArray(fill)) {
        // A `Color` is also an array — of numbers. A fill chain is an array of
        // layers, which are strings or objects.
        if (fill.every((entry) => typeof entry === "number")) {
            return { color: fill as unknown as Color };
        }
        return { map: rasterized(fill as Fill, options) };
    }

    if (typeof fill === "object") {
        if (isSurfaceSourceValue(fill)) return { map: surfaceFor(fill as SurfaceSource3D, options) };
        if (isTextureDescriptor(fill)) return { map: fill as Texture3D };
        if (isSolidLayer(fill)) return { color: (fill as { color: Color }).color };
    }

    return { map: rasterized(fill as Fill, options) };
}

/**
 * A surface texture painting `source` directly.
 *
 * Identity comes from the source object, which the `Tex.surface` contract already
 * requires to be hoisted — so nothing has to be written by hand and a source that
 * goes out of scope stops being cached.
 */
function surfaceFor(source: SurfaceSource3D, options: Fill3DOptions): Texture3D {
    return {
        source,
        width: options.width ?? DEFAULT_SIZE,
        height: options.height ?? DEFAULT_SIZE,
    };
}

/**
 * A surface texture painting a fill chain into a rect that fills the buffer.
 *
 * Marked `static` and given a derived identity, because a fill chain describes
 * the *same* pixels every frame unless one of its own values moved. Without both
 * of those a gradient on a cube would re-rasterize a 512² offscreen buffer and
 * re-upload it sixty times a second to produce an identical image — which is
 * exactly the trap that makes "just render it to a texture" a bad idea in
 * general, and is worth the small amount of bookkeeping to avoid.
 *
 * A chain holding something genuinely live (a video layer, a `Fills.canvas3D`) is
 * still re-rasterized: those carry object identity, which `fillIdentity` folds in
 * and which changes when the content does.
 */
function rasterized(fill: Fill, options: Fill3DOptions): Texture3D {
    const width = options.width ?? DEFAULT_SIZE;
    const height = options.height ?? DEFAULT_SIZE;
    return {
        source: new Graphics2D().rect({ width, height }).fill(fill),
        width,
        height,
        static: true,
        identity: `fill:${fillIdentity(fill)}:${width}x${height}`,
    };
}

/**
 * True for a string that names an asset rather than a colour.
 *
 * Leading `/` or `.` is a path by construction; otherwise the extension decides.
 * A colour never matches either, and a bare name like `"wood"` is a colour —
 * which is right, since an asset reference without a path or extension is not
 * something the manifest could resolve either.
 */
export function looksLikeAssetPath(value: string): boolean {
    return value.startsWith("/")
        || value.startsWith(".")
        || /\.(png|jpe?g|webp|avif|svg|ktx2?|hdr|exr|mp4|webm|mov)$/i.test(value);
}

/** True for a `Texture3D` descriptor object (not a source value). */
function isTextureDescriptor(value: object): boolean {
    return "src" in value || "data" in value || ("source" in value && "width" in value);
}

/**
 * True for a value that is 2D content to be painted, rather than a descriptor.
 *
 * Structural, like `resolveSurfaceSource`, and for the same reason: an
 * `instanceof` here would need value imports of `Node2D` and close a real module
 * cycle. A `Scene3D` also exposes `ops()`, so it is excluded explicitly — it is a
 * fill *layer* (`Fills.canvas3D`) rather than a 2D source, and routing it through
 * the chain arm is what gets it composited with the rest of the stack.
 */
function isSurfaceSourceValue(value: object): boolean {
    const bag = value as Record<string, unknown>;
    if (typeof bag.cameraDescriptor === "function") return false;
    if (typeof bag.ops === "function") return true;
    return typeof bag.id === "string" && typeof bag.attach === "function";
}

/** True for a single solid-colour fill layer, which needs no texture. */
function isSolidLayer(value: object): boolean {
    const bag = value as Record<string, unknown>;
    if (bag.type !== "solid" || bag.color === undefined) return false;
    // Anything beyond the colour — a per-layer opacity, a blend mode, a
    // reference space — is a composite the colour slot cannot express.
    return bag.opacity === undefined && bag.blend === undefined && bag.space === undefined;
}

/**
 * Interpolate two fills.
 *
 * Colours interpolate — that is the overwhelmingly common tween and it must not
 * snap. Anything else holds the start value and swaps at the end, because there
 * is no meaningful halfway between a gradient and a photograph; cross-fading two
 * surfaces is a *stack* (`fill={[a, b]}` with the second layer's opacity tweened),
 * which is how it is expressed in 2D too.
 *
 * The colour test is deliberately cheap and allocation-free: resolving a rich
 * fill builds a `Graphics2D` and a texture descriptor, and doing that twice per
 * frame for a tween that is going to snap anyway would be pure waste.
 */
export function lerpFill3D(from: Fill3D, to: Fill3D, t: number): Fill3D {
    const start = asPlainColor(from);
    const end = asPlainColor(to);
    if (start !== null && end !== null) {
        return lerpColor(normalize(start), normalize(end), t) as unknown as Fill3D;
    }
    return t < 1 ? from : to;
}

/** The colour a fill *is*, or `null` when it is anything richer. No allocation. */
function asPlainColor(fill: Fill3D | undefined): Color | null {
    if (fill === undefined || fill === null) return null;
    if (typeof fill === "string") return looksLikeAssetPath(fill) ? null : fill;
    if (Array.isArray(fill)) {
        return fill.every((entry) => typeof entry === "number") ? (fill as unknown as Color) : null;
    }
    if (typeof fill === "object" && isSolidLayer(fill)) return (fill as { color: Color }).color;
    return null;
}

function normalize(color: Color): NormalizedColor {
    return Array.isArray(color) ? (color as NormalizedColor) : parseColor(color);
}

const objectIds = new WeakMap<object, string>();
let objectCounter = 0;

/**
 * A stable key for a fill value.
 *
 * Plain data is walked and sorted; anything with a prototype of its own — a
 * `Scene3D`, a `Graphics2D`, a video source — is keyed by object identity, which
 * is both cheaper than serialising it and the honest answer, since two different
 * instances describe two different things whatever their fields say. A
 * `FillChain` is unwrapped to its list first, so building one inline still
 * produces the same key for the same layers.
 */
function fillIdentity(value: unknown): string {
    if (value === null || typeof value !== "object") return String(value);
    if (Array.isArray(value)) return `[${value.map(fillIdentity).join(",")}]`;

    const list = (value as { list?: unknown }).list;
    if (Array.isArray(list)) return fillIdentity(list);

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        let id = objectIds.get(value);
        if (id === undefined) {
            id = `@${objectCounter++}`;
            objectIds.set(value, id);
        }
        return id;
    }

    const bag = value as Record<string, unknown>;
    return `{${Object.keys(bag).sort().map((key) => `${key}:${fillIdentity(bag[key])}`).join(",")}}`;
}
