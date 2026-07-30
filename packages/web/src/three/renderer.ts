import type * as THREE from "three";
import type {
    RenderedView3D,
    ThreeModule,
    View3DRendererHost,
    View3DRendererSettings,
} from "@motion-script/skia-render";

/**
 * The single shared `WebGLRenderer` for every 3D node in the document.
 *
 * One renderer is a requirement, not an optimisation: browsers cap concurrent
 * WebGL contexts at roughly 16 and CanvasKit already owns one, so a renderer per
 * node would start losing contexts on any scene with a handful of 3D nodes. Each
 * node instead renders serially into this one, sized to its own destination, and
 * the result is uploaded before the next node draws.
 *
 * Created lazily on first render so merely importing this module never touches
 * WebGL (safe for SSR and unit tests).
 */
let renderer: THREE.WebGLRenderer | null = null;
let rendererAntialias = true;

/**
 * Device-pixel buffer size actually in use, per node.
 *
 * `setSize` reallocates the drawing buffer, which is expensive. A node under a
 * `scale` tween changes its derived device size every single frame, so without
 * quantisation it would reallocate 60 times a second and stutter. Sizes are
 * rounded up to {@link SIZE_QUANTUM} and never shrink within a session, letting
 * Skia scale a slightly-oversized image into the destination rect instead.
 */
const bufferSizes = new Map<string, { width: number; height: number }>();

const SIZE_QUANTUM = 64;

/** Conservative cap; the real limit is read from the GL context on first use. */
let maxTextureSize = 4096;

function createRenderer(three: ThreeModule, antialias: boolean): THREE.WebGLRenderer {
    const created = new three.WebGLRenderer({
        antialias,
        // Transparent so the 3D composites over whatever the 2D scene drew below.
        alpha: true,
        // three's default, and what the compositor's `srcIsPremul: true` assumes.
        premultipliedAlpha: true,
        // Keep the buffer readable for the texture upload. The upload happens in
        // the same synchronous task as the render, so this is belt-and-braces
        // rather than strictly required — see the note in the compositor.
        preserveDrawingBuffer: true,
    });
    created.setClearColor(0x000000, 0);
    created.setPixelRatio(1); // sizes are already in device pixels
    maxTextureSize = created.capabilities.maxTextureSize ?? maxTextureSize;
    return created;
}

/**
 * The shared renderer, creating it on first call.
 *
 * `antialias` is fixed at context creation, so a later change needs a new
 * context — the renderer is rebuilt when it flips, which is rare (it's a
 * per-node authoring choice, not something to animate).
 */
function getRenderer(three: ThreeModule, antialias: boolean): THREE.WebGLRenderer {
    if (renderer && rendererAntialias !== antialias) {
        renderer.dispose();
        renderer.forceContextLoss();
        renderer = null;
    }
    if (!renderer) {
        renderer = createRenderer(three, antialias);
        rendererAntialias = antialias;
        bufferSizes.clear();
    }
    return renderer;
}

/**
 * Round a requested device size up to a stable, GPU-friendly buffer size that
 * never shrinks for this node. See {@link bufferSizes}.
 */
function quantizeBuffer(key: string, width: number, height: number): { width: number; height: number } {
    const wanted = {
        width: Math.min(maxTextureSize, Math.max(1, Math.ceil(width / SIZE_QUANTUM) * SIZE_QUANTUM)),
        height: Math.min(maxTextureSize, Math.max(1, Math.ceil(height / SIZE_QUANTUM) * SIZE_QUANTUM)),
    };

    const current = bufferSizes.get(key);
    if (!current) {
        bufferSizes.set(key, wanted);
        return wanted;
    }

    // Grow only. A node that shrinks keeps its larger buffer, so a scale tween
    // reallocates at most once per size step rather than every frame.
    const grown = {
        width: Math.max(current.width, wanted.width),
        height: Math.max(current.height, wanted.height),
    };
    if (grown.width !== current.width || grown.height !== current.height) {
        bufferSizes.set(key, grown);
    }
    return grown;
}

/**
 * Render `scene` through `camera` at the given device-pixel size and return the
 * renderer's canvas for upload.
 *
 * The canvas is shared and reused, so the caller must consume it (upload to a
 * texture) before rendering another node — which the compositor does, since both
 * happen inside one synchronous draw call.
 */
export function renderView3D(
    three: ThreeModule,
    key: string,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number,
    options: { antialias?: boolean } = {},
): RenderedView3D {
    const active = getRenderer(three, options.antialias !== false);
    const size = quantizeBuffer(key, width, height);

    const current = active.getSize(new three.Vector2());
    if (current.x !== size.width || current.y !== size.height) {
        active.setSize(size.width, size.height, false);
    }

    active.render(scene, camera);

    return {
        source: active.domElement,
        width: size.width,
        height: size.height,
    };
}

/** Apply renderer-level scene settings that live on the renderer, not the scene. */
export function applyRendererSettings(
    three: ThreeModule,
    settings: View3DRendererSettings,
): void {
    if (!renderer) return;
    // Toggling shadow mapping recompiles every affected material, so only write
    // when it actually changes.
    if (renderer.shadowMap.enabled !== settings.shadowsEnabled) {
        renderer.shadowMap.enabled = settings.shadowsEnabled;
        renderer.shadowMap.needsUpdate = true;
    }
    if (renderer.shadowMap.type !== settings.shadowType) {
        renderer.shadowMap.type = settings.shadowType;
        renderer.shadowMap.needsUpdate = true;
    }
    renderer.toneMapping = settings.toneMapping;
    renderer.toneMappingExposure = settings.toneMappingExposure;
    void three;
}

/** The live renderer, or null before first use. For environment/PMREM helpers. */
export function activeRenderer(): THREE.WebGLRenderer | null {
    return renderer;
}

/**
 * Release the shared renderer and its GL context.
 *
 * Called on render-context unmount/dispose. Unlike CanvasKit's context (which is
 * deliberately kept alive because the canvas element outlives an HMR remount),
 * this one owns its own canvas and is safe to drop — it is recreated on the next
 * 3D frame.
 */
export function disposeSharedRenderer(): void {
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer = null;
    bufferSizes.clear();
}

/** Forget a node's buffer size, so a removed node stops pinning a large buffer. */
export function forgetView3DBuffer(key: string): void {
    bufferSizes.delete(key);
}

/**
 * This package's implementation of the renderer seam
 * `@motion-script/skia-render` declares.
 *
 * The reconciler and the 3D backend live in skia-render, which cannot import this
 * module — that would be an upward package dependency. So the renderer is handed
 * over instead, and everything above stays exactly as it was: module-level
 * singletons behind free functions, with this object as the adapter.
 *
 * **Registered from `../index.ts`, deliberately not here.** After the extraction
 * nothing in this package statically imports this module, and the package declares
 * `sideEffects: false` — so a module-scope registration here could legitimately be
 * tree-shaken away, and 3D would silently render nothing at all (`view3DBackend()`
 * returns null forever, the warm loop gives up after its three passes, and frames
 * ship with their 2D parts only and no error). It has to be in the barrel every
 * consumer imports, which is the same argument the comment on
 * `registerView3DBackend()` already makes.
 */
export const webView3DRendererHost: View3DRendererHost = {
    render: renderView3D,
    applySettings: applyRendererSettings,
    active: activeRenderer,
    forgetBuffer: forgetView3DBuffer,
    dispose: disposeSharedRenderer,
};
