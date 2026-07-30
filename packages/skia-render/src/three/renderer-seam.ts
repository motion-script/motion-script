/**
 * The platform boundary for 3D *rasterization*.
 *
 * Everything else about 3D is portable: `Graphics3D` is pure data from core, and
 * the reconciler, handlers and texture cache in this directory turn it into a
 * live three.js object graph without touching a GL context. But actually drawing
 * that graph needs one — `WebGLRenderer` over a DOM canvas in a browser, an
 * EGL/ANGLE context in a native embedder, nothing at all in a backend with no 3D.
 *
 * So the renderer is injected rather than imported. This is the one seam in the
 * package that *has* to be a registration rather than a constructor parameter: the
 * reconciler and backend reach the renderer from deep inside a synchronous frame,
 * and threading it down every call would change signatures the whole way.
 *
 * `@motion-script/web` registers its shared `WebGLRenderer` from its barrel. A
 * backend that registers nothing degrades gracefully — `view3DBackend()` returns
 * null, the existing warm-and-re-render path treats that as "three isn't ready",
 * and frames paint their 2D parts.
 */

import type * as THREE from "three";
import type { ThreeModule } from "./bridge";
import type { SkiaTextureSource } from "../assets";

/** What the compositor needs to upload and place a rendered 3D frame. */
export interface RenderedView3D {
    /**
     * The renderer's output, as an opaque texture source (see
     * {@link SkiaTextureSource}). Valid only until the next render — the buffer is
     * shared and reused, so the caller must consume it (upload it to a texture)
     * before rendering another slot. Both happen inside one synchronous draw, which
     * is what makes that safe.
     */
    source: SkiaTextureSource;
    /** Device-pixel size of the drawing buffer — the source rect for the upload. */
    width: number;
    height: number;
}

/** Renderer-level settings that live on the renderer rather than the scene. */
export interface View3DRendererSettings {
    shadowsEnabled: boolean;
    shadowType: THREE.ShadowMapType;
    toneMapping: THREE.ToneMapping;
    toneMappingExposure: number;
}

/**
 * A platform's 3D renderer.
 *
 * One renderer is shared by every 3D slot, which is a requirement rather than an
 * optimisation: browsers cap concurrent WebGL contexts at roughly 16 and CanvasKit
 * already owns one, so a context per slot would start losing them on any scene
 * with a handful of 3D nodes. Slots render serially into the one renderer and each
 * result is uploaded before the next draws.
 */
export interface View3DRendererHost {
    /**
     * Render `scene` through `camera` at the given device-pixel size and return the
     * buffer for upload. `key` identifies the slot, so the host can keep a stable
     * (quantized, grow-only) buffer size per slot rather than reallocating on every
     * frame of a scale tween.
     */
    render(
        three: ThreeModule,
        key: string,
        scene: THREE.Scene,
        camera: THREE.Camera,
        width: number,
        height: number,
        options: { antialias?: boolean },
    ): RenderedView3D;

    /** Apply shadow/tone-mapping settings, which live on the renderer. */
    applySettings(three: ThreeModule, settings: View3DRendererSettings): void;

    /**
     * The live renderer, or null before first use.
     *
     * Typed as three's `WebGLRenderer` because its one consumer genuinely needs
     * that: environment maps go through `PMREMGenerator`, which takes a renderer.
     * A host with no WebGL returns null and environment maps are skipped.
     */
    active(): THREE.WebGLRenderer | null;

    /** Forget a slot's buffer size, so a removed node stops pinning a large buffer. */
    forgetBuffer(key: string): void;

    /** Release the renderer and its GL context. */
    dispose(): void;
}

let host: View3DRendererHost | null = null;

/**
 * Install the platform's 3D renderer. Called once, from the platform package's
 * barrel — see the note in `@motion-script/web`'s `index.ts` about why it must be
 * the barrel and not the renderer module itself.
 */
export function registerView3DRendererHost(next: View3DRendererHost): void {
    host = next;
}

/** The registered renderer, or null when the platform provides no 3D. */
export function view3DRendererHost(): View3DRendererHost | null {
    return host;
}

/** Drop the registration. Test-only — the host is process-wide. */
export function __resetView3DRendererHostForTests(): void {
    host = null;
}
