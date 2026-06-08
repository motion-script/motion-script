import type { CanvasKit } from "@motion-script/canvaskit";
import { CanvasKitEffect } from "./effect";
import { type BlurEffect } from "@motion-script/core";

export class BlurCanvasKitEffect extends CanvasKitEffect<BlurEffect> {
    constructor() {
        super("blur");
    }

    makeImageFilter(effect: BlurEffect, ck: CanvasKit): any {
        // Skia's blur sigma is roughly half the perceived "radius" of the blur.
        const sigma = effect.radius / 2;
        return ck.ImageFilter.MakeBlur(sigma, sigma, ck.TileMode.Decal, null);
    }
}
