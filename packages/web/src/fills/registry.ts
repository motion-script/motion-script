import type { FillResolved } from "@motion-script/core";
import { ImageFillRenderer } from "./image";
import { VideoFillRenderer } from "./video";
import { LinearGradientFillRenderer } from "./linear-gradient";
import { RadialGradientFillRenderer } from "./radial-gradient";
import { ConicGradientFillRenderer } from "./conic-gradient";
import { NoiseFillRenderer } from "./noise";
import { StripeFillRenderer } from "./stripe";
import { SolidFillRenderer } from "./solid";
import { FillRenderer, type FillRendererContext } from "./renderer";

interface FillRendererEntry {
    name: string;
    renderer: FillRenderer<FillResolved>;
}

/** Dispatches a resolved fill to its renderer by `fill.type`, keyed in `list`. */
export class FillRenderRegistry {
    private static readonly list: FillRendererEntry[] = [
        { name: "color", renderer: new SolidFillRenderer() },
        { name: "linear-gradient", renderer: new LinearGradientFillRenderer() },
        { name: "radial-gradient", renderer: new RadialGradientFillRenderer() },
        { name: "conic-gradient", renderer: new ConicGradientFillRenderer() },
        { name: "image", renderer: new ImageFillRenderer() },
        { name: "video", renderer: new VideoFillRenderer() },
        { name: "noise", renderer: new NoiseFillRenderer() },
        { name: "stripe", renderer: new StripeFillRenderer() },
    ];

    private static get(name: string): FillRenderer<FillResolved> | undefined {
        return this.list.find((entry) => entry.name === name)?.renderer;
    }

    static applyPaint(fill: FillResolved, ctx: FillRendererContext): boolean {
        const renderer = this.get(fill.type);
        if (!renderer) return false;
        return renderer.applyPaint(fill as any, ctx);
    }

    static disposeRenderers(): void {
        for (const { renderer } of this.list) {
            renderer?.dispose();
        }
    }
}
