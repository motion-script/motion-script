/**
 * The 3D backend's public face to the rest of `@motion-script/web`.
 *
 * The render context talks only to {@link Scene3DBackend}, so the lazy three
 * import stays an implementation detail: a 2D-only project reaches
 * `scene3DBackend()`, gets `null`, and never pulls in the chunk.
 */

import type * as THREE from "three";
import type { Graphics3D } from "@motion-script/core";
import { threeModule, type ThreeModule } from "./bridge";
import { Scene3DGraph } from "./reconciler";
import { forgetScene3DBuffer, renderScene3D, type RenderedScene3D } from "./renderer";
import { TextureResolver, type Scene3DAssets } from "./handlers/texture";

export {
    loadScene3D, threeModule, registerScene3DBackend,
    requestScene3DWarm, warmPendingScene3D, __resetScene3DBridgeForTests,
} from "./bridge";
export { disposeSharedRenderer } from "./renderer";
export { disposeTextureCache } from "./handlers/texture";
export type { RenderedScene3D } from "./renderer";
export type { Scene3DAssets } from "./handlers/texture";

/**
 * Renders `Graphics3D` scenes to a canvas, one live three scene per node.
 *
 * Only obtainable once three has loaded — see {@link scene3DBackend}.
 */
export class Scene3DBackend {
    private readonly graphs = new Map<string, Scene3DGraph>();
    private readonly textures: TextureResolver;
    /** Frame counter, so graphs for removed nodes can be swept. */
    private frame = 0;
    private readonly touched = new Set<string>();

    constructor(
        private readonly three: ThreeModule,
        private readonly assets: Scene3DAssets,
    ) {
        this.textures = new TextureResolver(three, assets);
    }

    /**
     * Reconcile and render `graphics` for `nodeId` at the given device-pixel size.
     *
     * Returns the renderer's canvas plus its buffer size. The canvas is shared and
     * reused, so the caller must upload it before rendering another node — which
     * the compositor does, both happening inside one synchronous draw.
     */
    render(
        nodeId: string,
        graphics: Graphics3D,
        width: number,
        height: number,
        options: { antialias?: boolean } = {},
    ): RenderedScene3D {
        let graph = this.graphs.get(nodeId);
        if (!graph) {
            graph = new Scene3DGraph(this.three);
            this.graphs.set(nodeId, graph);
        }
        this.touched.add(nodeId);

        const { scene, camera } = graph.sync(graphics, width, height, this.textures);
        return renderScene3D(this.three, nodeId, scene, camera, width, height, options);
    }

    /**
     * Mark the start of a frame. The compositor calls this once per render pass so
     * {@link sweep} can tell which nodes are gone.
     */
    beginFrame(): void {
        this.frame++;
        this.touched.clear();
    }

    /**
     * Drop the graphs of nodes that didn't render this frame — a `Scene3D` removed
     * from the tree, or a scene switch. Mirrors the reconciler's own orphan sweep,
     * one level up.
     */
    sweep(): void {
        for (const [nodeId, graph] of this.graphs) {
            if (this.touched.has(nodeId)) continue;
            this.release(nodeId, graph);
            this.graphs.delete(nodeId);
        }
    }

    /** Free every graph this backend owns. */
    dispose(): void {
        for (const [nodeId, graph] of this.graphs) this.release(nodeId, graph);
        this.graphs.clear();
        this.touched.clear();
    }

    /** Free everything held for one node: its scene, buffer size and CK texture. */
    private release(nodeId: string, graph: Scene3DGraph): void {
        graph.dispose();
        forgetScene3DBuffer(nodeId);
        this.assets.release3DTexture(nodeId);
    }

    /** The three namespace, for callers that need a constant or type. */
    get module(): ThreeModule {
        return this.three;
    }
}

let backend: Scene3DBackend | null = null;

/**
 * The 3D backend, or `null` until three has loaded.
 *
 * Synchronous by necessity — the render pass ends in `surface.flush()` and cannot
 * await. `null` means "draw the 2D parts and ask to be re-rendered", which the
 * existing warm-and-retry loop handles.
 */
export function scene3DBackend(assets: Scene3DAssets): Scene3DBackend | null {
    const three = threeModule();
    if (!three) return null;
    backend ??= new Scene3DBackend(three, assets);
    return backend;
}

/** Tear down the backend. Called on render-context unmount/dispose. */
export function disposeScene3DBackend(): void {
    backend?.dispose();
    backend = null;
}

/** The three namespace once loaded, for tests and environment helpers. */
export function scene3DModule(): typeof THREE | null {
    return threeModule();
}
