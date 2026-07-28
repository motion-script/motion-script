import type { Vector2 } from "@/attributes/layout/vector2";

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
 * A texture whose pixels are a 2D `Surface2D` child of the enclosing `Scene3D`,
 * rasterized offscreen every frame — the way to put Motion Script's own 2D
 * output (a `Graphics` command list, or a subtree of nodes) onto 3D geometry.
 *
 * `surface` matches the `Surface2D`'s `name`. It resolves per `Scene3D`, so two
 * viewports can each hold a `<Surface2D name="screen">` without colliding.
 */
export interface SurfaceTexture3D extends TextureOptions3D {
    surface: string;
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

/** True for the {@link SurfaceTexture3D} form — pixels come from a `Surface2D`. */
export function isSurfaceTexture3D(texture: Texture3D): texture is SurfaceTexture3D {
    return typeof texture !== "string" && "surface" in texture;
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
