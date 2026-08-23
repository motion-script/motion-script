/**
 * The live 3D backend: one three scene per 3D fill *slot*, reconciled and
 * rendered on demand.
 *
 * The unit of identity is a {@link Canvas3DSlotKey}, not a node — a node can carry
 * more than one 3D fill, and a fill cross-fade transiently produces two.
 *
 * Split out of `./index` so non-barrel modules (the render context) can import
 * it directly — importing the barrel would trip `import-x/no-internal-modules`.
 */

import type * as THREE from "three";
import type { RasterizedSurface, Scene3D, SurfaceTexture3D } from "@motion-script/core";
import { threeModule, type ThreeModule } from "./bridge";
import { Canvas3DGraph } from "./reconciler";
import { canvas3DRendererHost, type RenderedCanvas3D, type Canvas3DRendererHost } from "./renderer-seam";
import { TextureResolver, type Canvas3DAssets } from "./handlers/texture";

/**
 * Renders `Scene3D` scenes to a canvas, one live three scene per node.
 *
 * Only obtainable once three has loaded — see {@link canvas3DBackend}.
 */
/**
 * Identity of one live 3D scene: `${nodeId}#${paintSlot}`.
 *
 * Opaque to everything downstream — every consumer only uses it as a Map key, so
 * per-slot sweeping falls out of the existing per-key logic with no extra rules.
 */
export type Canvas3DSlotKey = string;

export class Canvas3DBackend {
    private readonly graphs = new Map<Canvas3DSlotKey, Canvas3DGraph>();
    private readonly textures: TextureResolver;
    /** Frame counter, so graphs for removed nodes can be swept. */
    private frame = 0;
    private readonly touched = new Set<Canvas3DSlotKey>();

    /**
     * `host` is held rather than looked up per call so {@link render} can return a
     * non-nullable frame: {@link canvas3DBackend} only constructs a backend once a
     * host is registered, so within an instance the renderer always exists.
     */
    constructor(
        private readonly three: ThreeModule,
        private readonly assets: Canvas3DAssets,
        private readonly host: Canvas3DRendererHost,
    ) {
        this.textures = new TextureResolver(three, assets);
    }

    /**
     * Reconcile and render `g3` for `key` at the given device-pixel size.
     *
     * Returns the renderer's canvas plus its buffer size. The canvas is shared and
     * reused, so the caller must upload it before rendering another node — which
     * the compositor does, both happening inside one synchronous draw.
     */
    render(
        key: Canvas3DSlotKey,
        g3: Scene3D,
        width: number,
        height: number,
        options: {
            antialias?: boolean;
            /** This frame's rasterized 2D buffers, keyed by descriptor identity. */
            rasters?: ReadonlyMap<SurfaceTexture3D, RasterizedSurface>;
        } = {},
    ): RenderedCanvas3D {
        let graph = this.graphs.get(key);
        if (!graph) {
            graph = new Canvas3DGraph(this.three);
            this.graphs.set(key, graph);
        }
        this.touched.add(key);

        // Scoped per slot: the texture cache is global, and two fills can hold
        // structurally identical surface descriptors.
        this.textures.setRasters(key, options.rasters);
        const { scene, camera } = graph.sync(g3, width, height, this.textures);
        return this.host.render(this.three, key, scene, camera, width, height, options);
    }

    /**
     * Mark the start of a frame. The compositor calls this once per render pass so
     * {@link sweep} can tell which slots are gone.
     */
    beginFrame(): void {
        this.frame++;
        this.touched.clear();
    }

    /**
     * Drop the graphs of slots that didn't render this frame — a fill removed, a
     * node removed from the tree, or a scene switch. Mirrors the reconciler's own
     * orphan sweep, one level up.
     */
    sweep(): void {
        for (const [key, graph] of this.graphs) {
            if (this.touched.has(key)) continue;
            this.release(key, graph);
            this.graphs.delete(key);
        }
    }

    /** Free every graph this backend owns. */
    dispose(): void {
        for (const [key, graph] of this.graphs) this.release(key, graph);
        this.graphs.clear();
        this.touched.clear();
    }

    /** Free everything held for one slot: its scene, buffer size and CK texture. */
    private release(key: Canvas3DSlotKey, graph: Canvas3DGraph): void {
        graph.dispose();
        this.host.forgetBuffer(key);
        this.assets.release3DTexture(key);
    }

    /** The three namespace, for callers that need a constant or type. */
    get module(): ThreeModule {
        return this.three;
    }
}

let backend: Canvas3DBackend | null = null;

/**
 * The 3D backend, or `null` until three has loaded *and* a platform renderer is
 * registered.
 *
 * Synchronous by necessity — the render pass ends in `surface.flush()` and cannot
 * await. `null` means "draw the 2D parts and ask to be re-rendered", which the
 * existing warm-and-retry loop handles.
 *
 * The host check makes a 3D-less backend degrade through that same path rather
 * than throwing mid-frame: a renderer with no GL context (a CPU-raster Node
 * backend, say) registers nothing, and every 3D fill simply declines to paint.
 */
export function canvas3DBackend(assets: Canvas3DAssets): Canvas3DBackend | null {
    const three = threeModule();
    if (!three) return null;
    const host = canvas3DRendererHost();
    if (!host) return null;
    backend ??= new Canvas3DBackend(three, assets, host);
    return backend;
}

/** Tear down the backend. Called on render-context unmount/dispose. */
export function disposeCanvas3DBackend(): void {
    backend?.dispose();
    backend = null;
}

/** The three namespace once loaded, for tests and environment helpers. */
export function canvas3DModule(): typeof THREE | null {
    return threeModule();
}
