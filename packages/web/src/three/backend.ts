/**
 * The live 3D backend: one three scene per 3D fill *slot*, reconciled and
 * rendered on demand.
 *
 * The unit of identity is a {@link View3DSlotKey}, not a node — a node can carry
 * more than one 3D fill, and a fill cross-fade transiently produces two.
 *
 * Split out of `./index` so non-barrel modules (the render context) can import
 * it directly — importing the barrel would trip `import-x/no-internal-modules`.
 */

import type * as THREE from "three";
import type { Graphics3D, RasterizedSurface, SurfaceTexture3D } from "@motion-script/core";
import { threeModule, type ThreeModule } from "./bridge";
import { View3DGraph } from "./reconciler";
import { forgetView3DBuffer, renderView3D, type RenderedView3D } from "./renderer";
import { TextureResolver, type View3DAssets } from "./handlers/texture";

/**
 * Renders `Graphics3D` scenes to a canvas, one live three scene per node.
 *
 * Only obtainable once three has loaded — see {@link view3DBackend}.
 */
/**
 * Identity of one live 3D scene: `${nodeId}#${paintSlot}`.
 *
 * Opaque to everything downstream — every consumer only uses it as a Map key, so
 * per-slot sweeping falls out of the existing per-key logic with no extra rules.
 */
export type View3DSlotKey = string;

export class View3DBackend {
    private readonly graphs = new Map<View3DSlotKey, View3DGraph>();
    private readonly textures: TextureResolver;
    /** Frame counter, so graphs for removed nodes can be swept. */
    private frame = 0;
    private readonly touched = new Set<View3DSlotKey>();

    constructor(
        private readonly three: ThreeModule,
        private readonly assets: View3DAssets,
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
        key: View3DSlotKey,
        g3: Graphics3D,
        width: number,
        height: number,
        options: {
            antialias?: boolean;
            /** This frame's rasterized 2D buffers, keyed by descriptor identity. */
            rasters?: ReadonlyMap<SurfaceTexture3D, RasterizedSurface>;
        } = {},
    ): RenderedView3D {
        let graph = this.graphs.get(key);
        if (!graph) {
            graph = new View3DGraph(this.three);
            this.graphs.set(key, graph);
        }
        this.touched.add(key);

        // Scoped per slot: the texture cache is global, and two fills can hold
        // structurally identical surface descriptors.
        this.textures.setRasters(key, options.rasters);
        const { scene, camera } = graph.sync(g3, width, height, this.textures);
        return renderView3D(this.three, key, scene, camera, width, height, options);
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
    private release(key: View3DSlotKey, graph: View3DGraph): void {
        graph.dispose();
        forgetView3DBuffer(key);
        this.assets.release3DTexture(key);
    }

    /** The three namespace, for callers that need a constant or type. */
    get module(): ThreeModule {
        return this.three;
    }
}

let backend: View3DBackend | null = null;

/**
 * The 3D backend, or `null` until three has loaded.
 *
 * Synchronous by necessity — the render pass ends in `surface.flush()` and cannot
 * await. `null` means "draw the 2D parts and ask to be re-rendered", which the
 * existing warm-and-retry loop handles.
 */
export function view3DBackend(assets: View3DAssets): View3DBackend | null {
    const three = threeModule();
    if (!three) return null;
    backend ??= new View3DBackend(three, assets);
    return backend;
}

/** Tear down the backend. Called on render-context unmount/dispose. */
export function disposeView3DBackend(): void {
    backend?.dispose();
    backend = null;
}

/** The three namespace once loaded, for tests and environment helpers. */
export function view3DModule(): typeof THREE | null {
    return threeModule();
}
