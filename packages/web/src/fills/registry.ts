import type { FillResolved } from "@motion-script/core";
import { ImageFillRenderer } from "./image";
import { VideoFillRenderer } from "./video";
import { LinearGradientFillRenderer } from "./linear-gradient";
import { RadialGradientFillRenderer } from "./radial-gradient";
import { ConicGradientFillRenderer } from "./conic-gradient";
import { NoiseFillRenderer } from "./noise";
import { StripeFillRenderer } from "./stripe";
import { SolidFillRenderer } from "./solid";
// Statically imports the three bridge, exactly as `render-context.ts` already
// does. `three` itself still arrives only via the dynamic `import("three")`, so
// 2D-only bundles are unaffected — but a future attempt to lazy-load this
// registry would pull the bridge in with it.
import { View3DFillRenderer } from "./view3d";
import { FillRenderer, type FillRendererContext } from "./renderer";

interface FillRendererEntry {
    name: string;
    renderer: FillRenderer<FillResolved>;
}

/** Dispatches a resolved fill to its renderer by `fill.type`, keyed in `list`. */
export class FillRenderRegistry {
    private static readonly list: FillRendererEntry[] = [
        { name: "solid", renderer: new SolidFillRenderer() },
        { name: "linear-gradient", renderer: new LinearGradientFillRenderer() },
        { name: "radial-gradient", renderer: new RadialGradientFillRenderer() },
        { name: "conic-gradient", renderer: new ConicGradientFillRenderer() },
        { name: "image", renderer: new ImageFillRenderer() },
        { name: "video", renderer: new VideoFillRenderer() },
        { name: "noise", renderer: new NoiseFillRenderer() },
        { name: "stripe", renderer: new StripeFillRenderer() },
        { name: "view3D", renderer: new View3DFillRenderer() },
    ];

    private static get(name: string): FillRenderer<FillResolved> | undefined {
        return this.list.find((entry) => entry.name === name)?.renderer;
    }

    static applyPaint(fill: FillResolved, ctx: FillRendererContext): boolean {
        const renderer = this.get(fill.type);
        if (!renderer) return false;
        return renderer.applyPaint(fill as any, ctx);
    }

    /** Run a fill's optional pre-paint pass. No-op for renderers without one. */
    static preflight(fill: FillResolved, ctx: FillRendererContext): void {
        this.get(fill.type)?.preflight?.(fill as any, ctx);
    }

    static disposeRenderers(): void {
        for (const { renderer } of this.list) {
            renderer?.dispose();
        }
    }
}
