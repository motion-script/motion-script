import type { CanvasKit } from "@motion-script/canvaskit";
import { CanvasKitEffect } from "./effect";
import { type SceneEffect as IEffect } from "@motion-script/core";
import { BlurCanvasKitEffect } from "./blur";
import { DirectionalBlurCanvasKitEffect } from "./directional-blur";
import { GrayscaleCanvasKitEffect } from "./grayscale";
import { PixelateCanvasKitEffect } from "./pixelate";
import { BloomCanvasKitEffect } from "./bloom";
import { VintageCanvasKitEffect } from "./vintage";
import { ChromaticAberrationCanvasKitEffect } from "./chromatic-aberration";
import { InvertCanvasKitEffect } from "./invert";
import { ScatterCanvasKitEffect } from "./scatter";
import { MotionBlurCanvasKitEffect } from "./motion-blur";
import { SkSLLayerEffect } from "./sksl-layer";
export class CanvasKitEffectRegistry {
    // Handlers are heterogeneous — each accepts its own effect subtype and is
    // dispatched by `type` string — so the store is typed loosely. Effects
    // include both authored `SceneEffect`s and internal resolved-only effects
    // (e.g. motion blur resolved against a node's velocity).
    private static registry = new Map<string, CanvasKitEffect<any>>();

    static register(effect: CanvasKitEffect<any>): void {
        this.registry.set(effect.type, effect);
    }

    static get(type: string): CanvasKitEffect<any> | undefined {
        return this.registry.get(type);
    }

    static has(type: string): boolean {
        return this.registry.has(type);
    }

    static makeImageFilter(effect: IEffect, ck: CanvasKit, width: number, height: number): any {
        const handler = this.registry.get(effect.type);
        if (!handler) return null;
        return handler.makeImageFilter(effect, ck, width, height);
    }

    /**
     * Compose all effects into a single ImageFilter chain applied in array order
     * (index 0 is innermost — applied first to the layer content).
     */
    static composeFilters(effects: IEffect[], ck: CanvasKit, width: number, height: number): any | null {
        let composed: any = null;
        for (const effect of effects) {
            const filter = this.makeImageFilter(effect, ck, width, height);
            if (filter == null) continue;
            composed = composed === null
                ? filter
                : ck.ImageFilter.MakeCompose(filter, composed);
        }
        return composed;
    }

    static disposeAll(): void {
        for (const handler of this.registry.values()) {
            handler.dispose();
        }
    }
}
CanvasKitEffectRegistry.register(new BlurCanvasKitEffect());
CanvasKitEffectRegistry.register(new DirectionalBlurCanvasKitEffect());
CanvasKitEffectRegistry.register(new GrayscaleCanvasKitEffect());
CanvasKitEffectRegistry.register(new PixelateCanvasKitEffect());
CanvasKitEffectRegistry.register(new BloomCanvasKitEffect());
CanvasKitEffectRegistry.register(new VintageCanvasKitEffect());
CanvasKitEffectRegistry.register(new ChromaticAberrationCanvasKitEffect());
CanvasKitEffectRegistry.register(new InvertCanvasKitEffect());
CanvasKitEffectRegistry.register(new ScatterCanvasKitEffect());
CanvasKitEffectRegistry.register(new MotionBlurCanvasKitEffect());
CanvasKitEffectRegistry.register(new SkSLLayerEffect());