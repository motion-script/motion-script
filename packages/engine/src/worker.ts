import type { CanvasKit } from '@motion-script/canvaskit';
import { AssetCatalog, type AssetManifest, type Size2D } from '@motion-script/core';
import { NodeRenderContext } from './render-context.js';
import { NodeStorageAdapter, type AssetLoader, type ImageDecoder } from './storage-adapter.js';
import type { EngineLogger } from './types.js';

/**
 * One render's Skia surface, storage adapter and decode caches.
 *
 * Kept across renders rather than rebuilt per call: the caches are the whole
 * point — a registered font, a decoded image and a shaped paragraph all survive
 * into the next render of the same content, which is what makes a warm engine
 * faster than a cold process.
 *
 * The viewport is not one of the things that survives. It clamps the resolution
 * images decode at, so cached decodes made for one viewport are genuinely wrong
 * at a larger one; changing it rebuilds the adapter rather than reusing it.
 */
export class RenderWorker {
    private context: NodeRenderContext;
    private adapter: NodeStorageAdapter;
    private catalog: AssetCatalog;
    private viewport: Size2D;

    constructor(
        private readonly canvasKit: CanvasKit,
        private readonly deps: {
            manifest: AssetManifest;
            loadAsset: AssetLoader;
            decodeImage?: ImageDecoder;
            logger?: EngineLogger;
        },
        viewport: Size2D,
    ) {
        this.viewport = viewport;
        this.catalog = new AssetCatalog(deps.manifest);
        this.adapter = new NodeStorageAdapter({
            canvasKit,
            catalog: this.catalog,
            viewport,
            loadAsset: deps.loadAsset,
            decodeImage: deps.decodeImage,
            logger: deps.logger,
        });
        this.context = new NodeRenderContext(canvasKit, this.adapter);
    }

    /**
     * Ready the surface for a render of `viewport` at `scale`, rebuilding only
     * what actually has to change.
     */
    prepare(viewport: Size2D, scale: number): void {
        if (viewport.width !== this.viewport.width || viewport.height !== this.viewport.height) {
            this.rebuild(viewport);
        }
        const width = viewport.width * scale;
        const height = viewport.height * scale;
        if (!this.context.matches(width, height)) {
            this.context.mount(width, height);
        }
        this.context.pixelRatio = scale;
    }

    /** Swap in a new asset manifest, keeping every decode already cached. */
    setManifest(manifest: AssetManifest): void {
        this.catalog = new AssetCatalog(manifest);
        this.adapter.setCatalog(this.catalog);
    }

    get renderContext(): NodeRenderContext { return this.context; }
    get storageAdapter(): NodeStorageAdapter { return this.adapter; }
    get assetCatalog(): AssetCatalog { return this.catalog; }

    private rebuild(viewport: Size2D): void {
        this.context.unmount();
        this.adapter.dispose();
        this.viewport = viewport;
        this.adapter = new NodeStorageAdapter({
            canvasKit: this.canvasKit,
            catalog: this.catalog,
            viewport,
            loadAsset: this.deps.loadAsset,
            decodeImage: this.deps.decodeImage,
            logger: this.deps.logger,
        });
        this.context = new NodeRenderContext(this.canvasKit, this.adapter);
    }

    dispose(): void {
        this.context.unmount();
        this.adapter.dispose();
    }
}
