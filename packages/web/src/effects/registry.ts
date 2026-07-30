import type { CanvasKit } from "@motion-script/canvaskit";
import { effectSurface, type SceneEffect } from "@motion-script/core";
import type { EffectGeometry, EffectHandler, EffectTarget, RenderEffect } from "./handler";

import { blurEffectHandler } from "./blur";
import { directionalBlurEffectHandler } from "./directional-blur";
import { grayscaleEffectHandler } from "./grayscale";
import { pixelateEffectHandler } from "./pixelate";
import { bloomEffectHandler } from "./bloom";
import { vintageEffectHandler } from "./vintage";
import { chromaticAberrationEffectHandler } from "./chromatic-aberration";
import { invertEffectHandler } from "./invert";
import { scatterEffectHandler } from "./scatter";
import { motionBlurEffectHandler } from "./motion-blur";
import { skslEffectHandler } from "./sksl";
import { bulgeEffectHandler } from "./bulge";
import { magnifyEffectHandler } from "./magnify";
import { posterizeEffectHandler } from "./posterize";
import { outlineEffectHandler } from "./outline";
import { vignetteEffectHandler } from "./vignette";
import { grainEffectHandler } from "./grain";
import { sharpenEffectHandler } from "./sharpen";
import { edgesEffectHandler } from "./edges";
import { thresholdEffectHandler } from "./threshold";
import { radialBlurEffectHandler } from "./radial-blur";
import { halftoneEffectHandler } from "./halftone";
import { ditherEffectHandler } from "./dither";
import { duotoneEffectHandler } from "./duotone";
import { rgbShiftEffectHandler } from "./rgb-shift";
import { scanlinesEffectHandler } from "./scanlines";
import { blockDisplaceEffectHandler } from "./block-displace";
import { bitCrushEffectHandler } from "./bit-crush";
import { asciiEffectHandler } from "./ascii";
import { streakEffectHandler } from "./streak";
import { godRaysEffectHandler } from "./god-rays";
import { oilPaintEffectHandler } from "./oil-paint";
import { textureEffectHandler } from "./texture";
import { displaceEffectHandler } from "./displace";
import { waveEffectHandler } from "./wave";
import { twirlEffectHandler } from "./twirl";
import { progressiveBlurEffectHandler } from "./progressive-blur";
import { kaleidoscopeEffectHandler } from "./kaleidoscope";
import { trailsEffectHandler } from "./trails";
import { exposureEffectHandler } from "../fills/filters/exposure";
import { alphaEffectHandler } from "../fills/filters/alpha";
import { colorMatrixEffectHandler } from "../fills/filters/color-matrix";
import { curvesEffectHandler } from "../fills/filters/curves";
import { colorAdjustmentEffectHandler } from "../fills/filters/color-adjustment";

/**
 * Effect types with no core `EffectData` entry — renderer-internal effects
 * produced during a draw. The surface assertion has nothing to check them
 * against, so it skips them.
 */
const RENDERER_INTERNAL = new Set<string>(["motionBlurResolved"]);

const handlers = new Map<string, EffectHandler>();

/**
 * Check that a handler's declared capability matches the effect's
 * `EffectSurface` in core.
 *
 * Core owns the decision of *whether* an effect needs a shader scope (it drives
 * `foregroundShaderEffects`); this registry owns *how*. If the two disagree, an
 * effect either silently never renders or takes the wrong path — so catch it at
 * registration rather than at the first frame that uses it. Runs once per
 * handler at module load, so it is not worth gating behind a build flag.
 */
function assertSurfaceAgrees(handler: EffectHandler): void {
    if (RENDERER_INTERNAL.has(handler.type)) return;

    // `surface` can be a predicate over the effect, so probe both modes: a
    // handler is shader-capable if *any* mode needs a shader.
    const probe = (mode: "foreground" | "backdrop") =>
        effectSurface({ type: handler.type, mode } as SceneEffect);
    const needsShader = probe("foreground") === "shader" || probe("backdrop") === "shader";

    if (needsShader && !handler.makeShader) {
        console.warn(
            `[motion-script] Effect '${handler.type}' declares surface 'shader' in core but its ` +
            `renderer handler has no makeShader() — it will never render.`,
        );
    }
    if (handler.makeShader && !handler.sampling) {
        console.warn(
            `[motion-script] Effect handler '${handler.type}' has makeShader() but no sampling mode.`,
        );
    }
}

/**
 * The single registry of CanvasKit effect handlers — scene effects, media
 * filters, and renderer-internal effects alike.
 *
 * There is deliberately one registry rather than one per capability: an effect
 * that composes as an `ImageFilter` and one that needs a redraw scope differ
 * only in which method they implement, and the *call site* already knows which
 * it wants.
 */
export const EffectRegistry = {
    register(handler: EffectHandler): void {
        assertSurfaceAgrees(handler);
        handlers.set(handler.type, handler);
    },

    get(type: string): EffectHandler | undefined {
        return handlers.get(type);
    },

    has(type: string): boolean {
        return handlers.has(type);
    },

    /** Build one effect's ImageFilter, or `null` if it has no filter path or is a no-op. */
    makeImageFilter(effect: RenderEffect, ck: CanvasKit, geom: EffectGeometry): any {
        const handler = handlers.get(effect.type);
        if (!handler?.makeImageFilter) return null;
        return handler.makeImageFilter(effect, ck, geom);
    },

    /**
     * Compose effects into a single ImageFilter chain applied in array order
     * (index 0 is innermost — applied first to the content). Order matters:
     * blur-then-grayscale ≠ grayscale-then-blur.
     */
    compose(effects: readonly RenderEffect[], ck: CanvasKit, geom: EffectGeometry): any | null {
        let composed: any = null;
        for (const effect of effects) {
            const filter = this.makeImageFilter(effect, ck, geom);
            if (filter == null) continue;
            composed = composed === null ? filter : ck.ImageFilter.MakeCompose(filter, composed);
        }
        return composed;
    },

    /** The shader-capable handler for `effect` on `target`, or `undefined`. */
    resolveShader(effect: RenderEffect, target: EffectTarget): EffectHandler | undefined {
        const handler = handlers.get(effect.type);
        if (!handler?.makeShader) return undefined;
        if (handler.handles && !handler.handles(effect, target)) return undefined;
        return handler;
    },

    /** Whether `effect` renders via a shader (vs. an ImageFilter) for `target`. */
    isShaderEffect(effect: RenderEffect, target: EffectTarget): boolean {
        return this.resolveShader(effect, target) !== undefined;
    },

    disposeAll(): void {
        for (const handler of handlers.values()) handler.dispose?.();
    },
};

// Scene effects.
EffectRegistry.register(blurEffectHandler);
EffectRegistry.register(directionalBlurEffectHandler);
EffectRegistry.register(grayscaleEffectHandler);
EffectRegistry.register(pixelateEffectHandler);
EffectRegistry.register(bloomEffectHandler);
EffectRegistry.register(vintageEffectHandler);
EffectRegistry.register(chromaticAberrationEffectHandler);
EffectRegistry.register(invertEffectHandler);
EffectRegistry.register(scatterEffectHandler);
EffectRegistry.register(motionBlurEffectHandler);
EffectRegistry.register(bulgeEffectHandler);
EffectRegistry.register(magnifyEffectHandler);
EffectRegistry.register(posterizeEffectHandler);
EffectRegistry.register(outlineEffectHandler);
EffectRegistry.register(vignetteEffectHandler);
EffectRegistry.register(grainEffectHandler);
EffectRegistry.register(sharpenEffectHandler);
EffectRegistry.register(edgesEffectHandler);
EffectRegistry.register(thresholdEffectHandler);
EffectRegistry.register(radialBlurEffectHandler);
EffectRegistry.register(halftoneEffectHandler);
EffectRegistry.register(ditherEffectHandler);
EffectRegistry.register(duotoneEffectHandler);
EffectRegistry.register(rgbShiftEffectHandler);
EffectRegistry.register(scanlinesEffectHandler);
EffectRegistry.register(blockDisplaceEffectHandler);
EffectRegistry.register(bitCrushEffectHandler);
EffectRegistry.register(asciiEffectHandler);
EffectRegistry.register(streakEffectHandler);
EffectRegistry.register(godRaysEffectHandler);
EffectRegistry.register(oilPaintEffectHandler);
EffectRegistry.register(textureEffectHandler);
EffectRegistry.register(displaceEffectHandler);
EffectRegistry.register(waveEffectHandler);
EffectRegistry.register(twirlEffectHandler);
EffectRegistry.register(progressiveBlurEffectHandler);
EffectRegistry.register(kaleidoscopeEffectHandler);
EffectRegistry.register(trailsEffectHandler);
EffectRegistry.register(skslEffectHandler);

// Media filters. `blur` and `grayscale` are deliberately absent — after the
// field unification they are the same effect with the same implementation as
// their scene-effect counterparts above, so one handler serves both. `curves`
// and `colorAdjustment` now do double duty the same way: one handler each,
// serving both the media filter and the scene effect of that name.
EffectRegistry.register(exposureEffectHandler);
EffectRegistry.register(alphaEffectHandler);
EffectRegistry.register(colorMatrixEffectHandler);
EffectRegistry.register(curvesEffectHandler);
EffectRegistry.register(colorAdjustmentEffectHandler);
