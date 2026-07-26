import { SceneEffect } from "./union";

import { blurEffect } from "./implementations/blur";
import { directionalBlurEffect } from "./implementations/directional-blur";
import { grayscaleEffect } from "./implementations/grayscale";
import { pixelateEffect } from "./implementations/pixelate";
import { bulgeEffect } from "./implementations/bulge";
import { magnifyEffect } from "./implementations/magnify";
import { bloomEffect } from "./implementations/bloom";
import { vintageEffect } from "./implementations/vintage";
import { chromaticAberrationEffect } from "./implementations/chromatic-aberration";
import { invertEffect } from "./implementations/invert";
import { scatterEffect } from "./implementations/scatter";
import { posterizeEffect } from "./implementations/posterize";
import { motionBlurEffect } from "./implementations/motion-blur";
import { skslEffect } from "./implementations/sksl";
import { outlineEffect } from "./implementations/outline";
import { vignetteEffect } from "./implementations/vignette";
import { grainEffect } from "./implementations/grain";
import { sharpenEffect } from "./implementations/sharpen";
import { edgesEffect } from "./implementations/edges";
import { thresholdEffect } from "./implementations/threshold";
import { radialBlurEffect } from "./implementations/radial-blur";
import { halftoneEffect } from "./implementations/halftone";
import { ditherEffect } from "./implementations/dither";
import { duotoneEffect } from "./implementations/duotone";
import { curvesEffect } from "./implementations/curves";
import { colorAdjustmentEffect } from "./implementations/color-adjustment";
import { rgbShiftEffect } from "./implementations/rgb-shift";
import { scanlinesEffect } from "./implementations/scanlines";
import { blockDisplaceEffect } from "./implementations/block-displace";
import { bitCrushEffect } from "./implementations/bit-crush";
import { EffectData, EffectSurface } from "./effect-data";


const EFFECTS = new Map<string, EffectData<SceneEffect>>([
    ["blur", blurEffect as EffectData<SceneEffect>],
    ["directionalBlur", directionalBlurEffect as EffectData<SceneEffect>],
    ["grayscale", grayscaleEffect as EffectData<SceneEffect>],
    ["pixelate", pixelateEffect as EffectData<SceneEffect>],
    ["bulge", bulgeEffect as EffectData<SceneEffect>],
    ["magnify", magnifyEffect as EffectData<SceneEffect>],
    ["bloom", bloomEffect as EffectData<SceneEffect>],
    ["vintage", vintageEffect as EffectData<SceneEffect>],
    ["chromaticAberration", chromaticAberrationEffect as EffectData<SceneEffect>],
    ["invert", invertEffect as EffectData<SceneEffect>],
    ["scatter", scatterEffect as EffectData<SceneEffect>],
    ["posterize", posterizeEffect as EffectData<SceneEffect>],
    ["motionBlur", motionBlurEffect as EffectData<SceneEffect>],
    ["sksl", skslEffect as EffectData<SceneEffect>],
    ["outline", outlineEffect as EffectData<SceneEffect>],
    ["vignette", vignetteEffect as EffectData<SceneEffect>],
    ["grain", grainEffect as EffectData<SceneEffect>],
    ["sharpen", sharpenEffect as EffectData<SceneEffect>],
    ["edges", edgesEffect as EffectData<SceneEffect>],
    ["threshold", thresholdEffect as EffectData<SceneEffect>],
    ["radialBlur", radialBlurEffect as EffectData<SceneEffect>],
    ["halftone", halftoneEffect as EffectData<SceneEffect>],
    ["dither", ditherEffect as EffectData<SceneEffect>],
    ["duotone", duotoneEffect as EffectData<SceneEffect>],
    ["curves", curvesEffect as EffectData<SceneEffect>],
    ["colorAdjustment", colorAdjustmentEffect as EffectData<SceneEffect>],
    ["rgbShift", rgbShiftEffect as EffectData<SceneEffect>],
    ["scanlines", scanlinesEffect as EffectData<SceneEffect>],
    ["blockDisplace", blockDisplaceEffect as EffectData<SceneEffect>],
    ["bitCrush", bitCrushEffect as EffectData<SceneEffect>],
]);

/**
 * How a backend must realise `effect` — see {@link EffectSurface}. Unknown types
 * fall back to `"filter"`, the composable default.
 */
export function effectSurface(effect: SceneEffect): EffectSurface {
    const surface = EFFECTS.get(effect.type)?.surface;
    if (surface === undefined) return "filter";
    return typeof surface === "function" ? surface(effect) : surface;
}

/** @internal */
export function lerpEffect(from: SceneEffect, to: SceneEffect, t: number): SceneEffect {
    if (from.type !== to.type) return t < 0.5 ? from : to;
    const data = EFFECTS.get(from.type);
    return data ? data.lerp(from, to, t) : (t < 0.5 ? from : to);
}

/** @internal */
export function lerpEffectArray(from: SceneEffect[], to: SceneEffect[], t: number): SceneEffect[] {
    if (from === to) return from;
    const maxLen = Math.max(from.length, to.length);
    const result: SceneEffect[] = [];
    for (let i = 0; i < maxLen; i++) {
        const a = from[i];
        const b = to[i];
        if (a && b) {
            result.push(lerpEffect(a, b, t));
        } else if (a) {
            result.push(a);
        } else if (b) {
            result.push(b);
        }
    }
    return result;
}
