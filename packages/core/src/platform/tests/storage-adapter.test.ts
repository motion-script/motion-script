import { describe, expect, it } from "vitest";

import { StorageAdapter } from "@/platform/storage-adapter";
import { AssetCatalog, ManifestAssetCatalog } from "@/assets/catalog";
import type { AssetManifest } from "@/assets/manifest";

const EMPTY: AssetManifest = { image: {}, video: {}, audio: {}, font: {} };

function catalogWith(family: string): AssetCatalog {
    return new ManifestAssetCatalog({
        ...EMPTY,
        font: { [`${family}@400`]: { src: `${family}.woff2`, fontFamily: family, fontWeight: 400, sizeBytes: 0 } },
    });
}

/** Records what it was asked to load and reports fonts as loaded only when described. */
class RecordingAdapter extends StorageAdapter {
    readonly fontAttempts: string[] = [];

    constructor(catalog: AssetCatalog) {
        super(catalog, { width: 100, height: 100 });
    }

    async loadImage(): Promise<void> { }
    async loadVideo(): Promise<void> { }
    async loadAudio(): Promise<void> { }
    async fetchAudioData(): Promise<ArrayBuffer> { return new ArrayBuffer(0); }

    async loadFont(_key: string, fontFamily: string): Promise<boolean> {
        this.fontAttempts.push(fontFamily);
        return this.catalog.getFontFamilyMetas(fontFamily).length > 0;
    }

    fontRecord(family: string) {
        return { type: "font", src: family, fontFamily: family, fontWeight: 400, startFrame: 0, endFrame: 0 } as const;
    }
}

describe("StorageAdapter caching", () => {
    it("stops asking for a font once it has actually loaded", async () => {
        const adapter = new RecordingAdapter(catalogWith("Inter"));

        await adapter.loadAsset("Inter", adapter.fontRecord("Inter"));
        await adapter.loadAsset("Inter", adapter.fontRecord("Inter"));

        expect(adapter.fontAttempts).toEqual(["Inter"]);
    });

    it("keeps retrying a family the manifest cannot describe", async () => {
        // The bug this guards. Caching an undescribable family marked it handled
        // for the life of the adapter — so installing a typeface, which folds a
        // new face into the *live* manifest rather than rebuilding the
        // controller, could never load it. The text stayed in the fallback face
        // until something else tore the adapter down.
        const adapter = new RecordingAdapter(new ManifestAssetCatalog(EMPTY));

        await adapter.loadAsset("Lora", adapter.fontRecord("Lora"));
        await adapter.loadAsset("Lora", adapter.fontRecord("Lora"));

        expect(adapter.fontAttempts).toEqual(["Lora", "Lora"]);
    });

    it("loads a family that a later manifest describes", async () => {
        const adapter = new RecordingAdapter(new ManifestAssetCatalog(EMPTY));
        await adapter.loadAsset("Lora", adapter.fontRecord("Lora"));

        // What installing a typeface does.
        adapter.setCatalog(catalogWith("Lora"));
        await adapter.loadAsset("Lora", adapter.fontRecord("Lora"));

        // Asked twice, and the second attempt is the one that could succeed.
        expect(adapter.fontAttempts).toEqual(["Lora", "Lora"]);
        // And now it is remembered, so it isn't re-fetched every frame.
        await adapter.loadAsset("Lora", adapter.fontRecord("Lora"));
        expect(adapter.fontAttempts).toHaveLength(2);
    });
});
