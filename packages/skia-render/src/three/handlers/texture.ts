/**
 * `Texture3D` descriptor → `THREE.Texture`.
 *
 * Image textures come from core's ordinary asset pipeline: `Canvas3D.prepareRender`
 * declares each `src` via `tracker.addImage`, so by the time a frame draws,
 * `AssetManager.loadAt` has already awaited the decode and the pixels are sitting
 * in the storage adapter. This resolver only has to wrap them — which is why the
 * 3D draw can stay synchronous.
 *
 * ── On disposal ───────────────────────────────────────────────────────────────
 * Textures are cached globally and are **not** freed when the mesh referencing
 * them goes away; they are released wholesale on unmount. This is deliberate. The
 * alternative — reference-counting per mesh — is the single most bug-prone part of
 * a reconciler like this: miss a decrement and you leak, miss an increment and two
 * meshes sharing `/wood.png` silently destroy each other's texture mid-animation.
 *
 * The cost of not refcounting is bounded and small: one GPU texture per distinct
 * (source, sampler) pair actually used by the project, with the underlying *pixel*
 * memory already window-managed by `AssetManager`. That is a much better trade
 * than a class of intermittent, animation-dependent corruption bugs.
 */

import type * as THREE from "three";
import {
    isDataTexture3D, isSurfaceTexture3D, resolveTexture3D,
    type RasterizedSurface, type SurfaceTexture3D, type Texture3D, type TextureColorSpace3D,
} from "@motion-script/core";
import type { ThreeModule } from "../bridge";
import { colorSpace as toColorSpace, deg, magFilter, minFilter, wrap } from "./constants";

/**
 * The slice of the storage adapter the 3D backend needs. Narrowed to an interface
 * so the reconciler and texture cache stay testable without a real CanvasKit
 * surface.
 */
export interface Canvas3DAssets {
    /** Raw decoded RGBA pixels for an asset path, or null until loaded. */
    getImagePixels(src: string): { pixels: Uint8Array; width: number; height: number } | null;
    /** Free the CanvasKit composite texture held for a node that's gone away. */
    release3DTexture(key: string): void;
}

interface CachedTexture {
    texture: THREE.Texture;
    /** Last `revision` uploaded, for data textures mutated in place. */
    revision?: number;
    /** True once real pixels landed — a placeholder is retried next frame. */
    resolved: boolean;
}

const cache = new Map<string, CachedTexture>();

/**
 * Resolves texture descriptors against the storage adapter, memoising the
 * resulting GPU textures.
 */
export class TextureResolver {
    /** The 3D fill slot {@link rasters} belongs to — scopes the cache key. */
    private surfaceOwner = "";
    private rasters?: ReadonlyMap<SurfaceTexture3D, RasterizedSurface>;

    constructor(
        private readonly three: ThreeModule,
        private readonly assets: Canvas3DAssets,
    ) { }

    /**
     * Hand in this frame's rasterized 2D buffers for one 3D fill slot, before its
     * graph syncs. Keyed by descriptor identity, and scoped per slot because the
     * resolver is shared across every 3D fill in the frame.
     */
    setRasters(ownerKey: string, rasters: ReadonlyMap<SurfaceTexture3D, RasterizedSurface> | undefined): void {
        this.surfaceOwner = ownerKey;
        this.rasters = rasters;
    }

    /**
     * The `THREE.Texture` for `descriptor`, or `null` when its pixels aren't
     * resident yet (in which case the material renders without that map this frame
     * and the caller asks to be re-rendered).
     */
    resolve(descriptor: Texture3D, defaultColorSpace: TextureColorSpace3D): THREE.Texture | null {
        const resolved = resolveTexture3D(descriptor);
        const key = textureKey(descriptor, defaultColorSpace, this.surfaceOwner);

        // A surface is re-rasterized every frame, so it re-uploads unconditionally
        // rather than comparing a revision — the pixels are new by construction.
        if (isSurfaceTexture3D(resolved)) {
            const raster = this.rasters?.get(resolved);
            if (!raster) return null;
            const cached = cache.get(key);
            if (cached?.resolved) {
                this.uploadRaster(cached.texture as THREE.DataTexture, raster);
                return cached.texture;
            }
            const texture = this.createRasterTexture(raster);
            this.applySampler(texture, descriptor, defaultColorSpace);
            cache.set(key, { texture, resolved: true });
            return texture;
        }

        const cached = cache.get(key);
        if (cached?.resolved) {
            if (isDataTexture3D(resolved) && cached.revision !== resolved.revision) {
                this.uploadData(cached.texture as THREE.DataTexture, resolved);
                cached.revision = resolved.revision;
            }
            return cached.texture;
        }

        const texture = isDataTexture3D(resolved)
            ? this.createDataTexture(resolved)
            : this.createImageTexture(resolved.src);

        if (!texture) return null;

        this.applySampler(texture, descriptor, defaultColorSpace);
        cache.set(key, {
            texture,
            revision: isDataTexture3D(resolved) ? resolved.revision : undefined,
            resolved: true,
        });
        return texture;
    }

    private createImageTexture(src: string): THREE.Texture | null {
        const decoded = this.assets.getImagePixels(src);
        if (!decoded) return null;

        const texture = new this.three.DataTexture(
            decoded.pixels,
            decoded.width,
            decoded.height,
            this.three.RGBAFormat,
            this.three.UnsignedByteType,
        );
        // The adapter decodes top-down (canvas order) while GL samples bottom-up.
        texture.flipY = true;
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * A texture from a `Surface2D`'s readback. Same shape as an image texture —
     * top-down RGBA bytes, so it wants the same `flipY` — but the pixels come from
     * this frame's offscreen pass rather than the asset pipeline.
     */
    private createRasterTexture(raster: RasterizedSurface): THREE.DataTexture {
        const texture = new this.three.DataTexture(
            raster.pixels,
            raster.width,
            raster.height,
            this.three.RGBAFormat,
            this.three.UnsignedByteType,
        );
        texture.flipY = true;
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Re-upload a surface's pixels in place. The buffer is reused when the size
     * held, so a steady-state animated surface allocates nothing per frame; a
     * resized surface swaps in the new one and lets three rebuild the GPU texture.
     */
    private uploadRaster(texture: THREE.DataTexture, raster: RasterizedSurface): void {
        const image = texture.image as { data: Uint8Array; width: number; height: number };
        if (image.width === raster.width && image.height === raster.height) {
            image.data.set(raster.pixels);
        } else {
            image.data = raster.pixels;
            image.width = raster.width;
            image.height = raster.height;
        }
        texture.needsUpdate = true;
    }

    private createDataTexture(descriptor: { data: ArrayLike<number>; width: number; height: number }): THREE.DataTexture {
        const texture = new this.three.DataTexture(
            toUint8(descriptor.data),
            descriptor.width,
            descriptor.height,
            this.three.RGBAFormat,
            this.three.UnsignedByteType,
        );
        texture.needsUpdate = true;
        return texture;
    }

    private uploadData(texture: THREE.DataTexture, descriptor: { data: ArrayLike<number> }): void {
        const image = texture.image as { data: Uint8Array };
        const source = toUint8(descriptor.data);
        if (image.data.length === source.length) {
            image.data.set(source);
        } else {
            image.data = source;
        }
        texture.needsUpdate = true;
    }

    private applySampler(
        texture: THREE.Texture,
        descriptor: Texture3D,
        defaultColorSpace: TextureColorSpace3D,
    ): void {
        const three = this.three;
        // A bare string carries no sampler options, so fall back to the defaults.
        const options: Partial<Exclude<Texture3D, string>> =
            typeof descriptor === "string" ? {} : descriptor;

        texture.wrapS = wrap(three, options.wrapS);
        texture.wrapT = wrap(three, options.wrapT);
        texture.magFilter = magFilter(three, options.magFilter);
        texture.minFilter = minFilter(three, options.minFilter);
        texture.colorSpace = toColorSpace(three, options.colorSpace ?? defaultColorSpace);

        if (options.repeat) {
            const [x, y] = pair(options.repeat);
            texture.repeat.set(x, y);
        }
        if (options.offset) {
            const [x, y] = pair(options.offset);
            texture.offset.set(x, y);
        }
        if (options.center) {
            const [x, y] = pair(options.center);
            texture.center.set(x, y);
        }
        if (options.rotation !== undefined) texture.rotation = deg(options.rotation);
        if (options.anisotropy !== undefined) texture.anisotropy = options.anisotropy;
        if (options.flipY !== undefined) texture.flipY = options.flipY;

        // Mipmapping needs power-of-two-friendly wrapping; three handles NPOT for
        // clamped textures but repeating NPOT needs mipmaps generated explicitly.
        texture.generateMipmaps = texture.minFilter !== three.NearestFilter
            && texture.minFilter !== three.LinearFilter;
    }
}

/**
 * Cache key: the source plus every sampler field, so two meshes wanting the same
 * image at different `repeat`s each get their own texture rather than fighting
 * over one.
 *
 * A {@link SurfaceTexture3D} is keyed by its `key` (or its position in the scene
 * walk) plus the owning slot, because its `source` is a live object that
 * `JSON.stringify` cannot distinguish — every one of them would otherwise collapse
 * onto a single cache entry and stomp each other frame to frame.
 */
function textureKey(
    descriptor: Texture3D,
    defaultColorSpace: TextureColorSpace3D,
    surfaceOwner: string,
): string {
    if (typeof descriptor === "string") return `${descriptor}|${defaultColorSpace}`;

    const bag = descriptor as unknown as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(bag).sort()) {
        // Contents are handled by `revision`; including them would make the key
        // change on every mutation and orphan the texture each frame.
        if (key === "data" || key === "revision") continue;
        // A `source` is a Graphics2D/Node2D instance: it serialises to `{}` or worse,
        // so identity comes from `key` + owner below instead.
        if (key === "source") continue;
        parts.push(`${key}=${JSON.stringify(bag[key])}`);
    }
    // A data texture has no src to key on, so fall back to its dimensions.
    if (isDataTexture3D(descriptor)) parts.push(`data=${descriptor.width}x${descriptor.height}`);
    if (isSurfaceTexture3D(descriptor)) parts.push(`owner=${surfaceOwner}`, `sfc=${descriptor.key ?? ""}`);
    parts.push(`cs=${defaultColorSpace}`);
    return parts.join("|");
}

function pair(value: { x: number; y: number } | readonly [number, number]): [number, number] {
    return Array.isArray(value) ? [value[0], value[1]] : [(value as { x: number }).x, (value as { y: number }).y];
}

function toUint8(source: ArrayLike<number>): Uint8Array {
    return source instanceof Uint8Array ? source : new Uint8Array(Array.from(source));
}

/** Release every cached texture. Called on render-context unmount/dispose. */
export function disposeTextureCache(): void {
    for (const entry of cache.values()) entry.texture.dispose();
    cache.clear();
}
