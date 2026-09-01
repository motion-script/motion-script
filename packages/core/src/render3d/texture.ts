import type { Vector2 } from "@/attributes/layout/vector2";
// Type-only, like `Color` above: `render3d` is pure data and never reaches into
// the render or node layers at runtime. See SurfaceSource3D.
import type { Graphics2D } from "@/render/graphics2d";
import type { Node } from "@/nodes/node/node";
import type { Node2D } from "@/nodes/2d/node2d";

/** How sampling behaves outside the 0–1 UV range. */
export type TextureWrap3D = "clamp" | "repeat" | "mirror";

/** How texels are blended when the texture is scaled. */
export type TextureFilter3D = "nearest" | "linear";

/**
 * Which colour space the texture's data is in.
 *
 * `"srgb"` for anything representing a *colour* an eye would see (albedo/`map`,
 * `emissiveMap`), so the renderer linearizes it before lighting maths.
 * `"linear"` for *data* maps whose channels are numbers rather than colours
 * (`normalMap`, `roughnessMap`, `metalnessMap`, `aoMap`, `displacementMap`) —
 * linearizing those would corrupt them. Each map slot defaults correctly, so
 * this only needs setting for unusual pipelines.
 */
export type TextureColorSpace3D = "srgb" | "linear";

/** Sampler state shared by every texture source. */
export interface TextureOptions3D {
    wrapS?: TextureWrap3D;
    wrapT?: TextureWrap3D;
    /** UV scale. `[2, 2]` tiles twice on each axis (needs a `repeat` wrap). */
    repeat?: Vector2 | readonly [number, number];
    offset?: Vector2 | readonly [number, number];
    /** UV rotation in **degrees**, about {@link center}. */
    rotation?: number;
    center?: Vector2 | readonly [number, number];
    magFilter?: TextureFilter3D;
    minFilter?: TextureFilter3D;
    /** Sharpness at grazing angles. Clamped to the GPU's maximum. */
    anisotropy?: number;
    flipY?: boolean;
    colorSpace?: TextureColorSpace3D;
}

/**
 * A texture loaded from the project's asset manifest.
 *
 * `src` is discovered by the asset-tracking render pass and requested through
 * core's ordinary image pipeline — the very same path a 2D image fill uses — so
 * the pixels are decoded and resident *before* the frame that needs them draws.
 */
export interface ImageTexture3D extends TextureOptions3D {
    src: string;
}

/**
 * A texture built from raw RGBA8888 bytes — the escape hatch for procedurally
 * generated pixels (gradient ramps, noise, LUTs, data encoded as colour).
 */
export interface DataTexture3D extends TextureOptions3D {
    data: ArrayLike<number>;
    width: number;
    height: number;
    /**
     * Bump to force a re-upload after mutating `data` in place. Mutation is
     * invisible to identity comparison, so without this the renderer cannot
     * tell the bytes changed. See {@link BufferGeometry3D.revision}.
     */
    revision?: number;
}

/**
 * A texture whose pixels are Motion Script's own 2D output, rasterized offscreen
 * — the way to put a chart, a readout or a whole laid-out UI onto 3D geometry.
 *
 * `source` is a value, not a name and not a mounted node: either a built
 * {@link Graphics2D} command list, or a `Node2D` subtree. Both are supplied directly,
 * so there is no matching indirection and nothing has to live in a particular
 * place in the scene tree.
 *
 *   g3.plane({ map: Tex.surface(scopeGraphics, 1024, 640) })
 *   g3.plane({ map: Tex.surface(statsSubtree, 1024, 640) })
 *
 * A `Node2D` source is *adopted for binding* by whatever paints the scene — it gets
 * that node's asset catalog, inherited context and clock, which is what makes a
 * webfont shape and an `<Image>` load. It is never laid out or painted by the
 * scene tree; it is measured against `width`×`height` and drawn into the buffer.
 *
 * **Hoist the source.** Building it fresh inside the scene builder allocates a new
 * subtree every frame — re-binding, re-laying-out, defeating the texture cache and
 * leaking. Declare it once and pass the same instance.
 *
 * That hoisting rule is also what removed this descriptor's old `key`: a hoisted
 * source *is* a stable identity, so the renderer keys the GPU texture off the
 * source object itself (in a `WeakMap`) rather than off its ordinal in the scene
 * walk. A conditionally-emitted surface therefore needs nothing written by hand,
 * and a source that goes out of scope becomes collectable instead of orphaning
 * its texture — which the ordinal scheme could not do.
 */
export interface SurfaceTexture3D extends TextureOptions3D {
    /** A built `Graphics2D`, or a `Node2D` subtree. Typed structurally — see below. */
    source: SurfaceSource3D;
    /** Buffer width in pixels. This *is* the texture's resolution. */
    width: number;
    /** Buffer height in pixels. */
    height: number;
    /**
     * Declare the source's pixels unchanging, so the buffer is rasterized once
     * and reused rather than redrawn every frame.
     *
     * Set by `resolveFill3D` for a fill chain, whose layers describe the same
     * image on every frame; an author's own source is live by default, which is
     * what makes an animated `Graphics2D` or a signal-driven subtree work with no
     * bookkeeping. Needs {@link identity} to be cacheable.
     *
     * @internal
     */
    static?: boolean;
    /**
     * Cache identity for a synthesized source.
     *
     * An author's source is identified by the source object itself (see the note
     * above), which is exactly right for something hoisted. A source built *for*
     * a fill is a fresh object every frame and has no such identity, so the value
     * it was derived from supplies one.
     *
     * @internal
     */
    identity?: string;
    /**
     * Ceiling on the buffer's device-pixel ratio. Default 1, i.e. the buffer is
     * exactly `width` × `height`.
     *
     * Unlike a 2D node — which wants to match the display — a surface is sampled by
     * a 3D material at whatever size the geometry occupies on screen, so the honest
     * control is `width`/`height`. Raise this only when a surface is viewed close
     * up and reads soft.
     */
    maxPixelRatio?: number;
}

/**
 * What a {@link SurfaceTexture3D} can be painted from: a built {@link Graphics2D}
 * command list, or a {@link Node2D} subtree.
 *
 * Both imports are **type-only**, exactly as `Color` is — `render3d` describes
 * scenes as data and never reaches into the render or node layers at runtime, and
 * a value import of `Node2D` here would close a real module cycle. Consumers narrow
 * with {@link resolveSurfaceSource}.
 */
export type SurfaceSource3D = Graphics2D | Node;

// Declared against the dimension-agnostic base because that is what JSX produces
// (`JSX.Element` is `Node`), so `Tex.surface(<Rect/>, …)` type-checks without a
// cast. It has to be a 2D subtree in fact — the renderer lays it out and draws it
// into a 2D buffer — and `resolveSurfaceSource` narrows to that; handing it a
// `Node3D` fails at render time rather than here.

/** A {@link SurfaceSource3D} narrowed to the arm its renderer should take. */
export type ResolvedSurfaceSource =
    | { kind: "graphics"; graphics: Graphics2D }
    | { kind: "node"; node: Node2D };

/**
 * Narrow a surface source to the arm that knows how to draw it: a `Graphics2D` is
 * replayed into a render context, a `Node2D` is laid out against the buffer and
 * rendered.
 *
 * Structural rather than `instanceof`, because that would need value imports of
 * both classes and close the cycle the type-only imports above avoid. `Graphics2D`
 * is a command recorder and exposes `ops()`; a `Node2D` has no such method. The
 * union makes any *other* value a type error, so this only has to separate two
 * known shapes rather than validate an unknown one.
 */
export function resolveSurfaceSource(source: SurfaceSource3D): ResolvedSurfaceSource {
    return typeof (source as Graphics2D).ops === "function"
        ? { kind: "graphics", graphics: source as Graphics2D }
        : { kind: "node", node: source as Node2D };
}

/**
 * A texture reference. A bare string is sugar for `{ src }`, so the common case
 * is `map: "/wood.png"`.
 */
export type Texture3D = string | ImageTexture3D | DataTexture3D | SurfaceTexture3D;

/** True for the raw-bytes form (vs. an asset-backed {@link ImageTexture3D}). */
export function isDataTexture3D(texture: Texture3D): texture is DataTexture3D {
    return typeof texture !== "string" && "data" in texture;
}

/** True for the {@link SurfaceTexture3D} form — pixels are rasterized from 2D. */
export function isSurfaceTexture3D(texture: Texture3D): texture is SurfaceTexture3D {
    return typeof texture !== "string" && "source" in texture;
}

/** Normalize the string shorthand to an {@link ImageTexture3D}. */
export function resolveTexture3D(texture: Texture3D): ImageTexture3D | DataTexture3D | SurfaceTexture3D {
    return typeof texture === "string" ? { src: texture } : texture;
}

/**
 * The asset `src` a texture reads from, or `null` when it has none (a data or
 * surface texture). Used by the asset-tracking pass to enumerate what a 3D scene
 * needs loaded — a `null` here means "nothing to request", not "not a texture".
 */
export function texture3DSource(texture: Texture3D): string | null {
    if (typeof texture === "string") return texture;
    if (isDataTexture3D(texture) || isSurfaceTexture3D(texture)) return null;
    return texture.src;
}
