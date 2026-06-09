import { SceneEffect } from "./union";

import { blurEffect } from "./implementations/blur";
import { backgroundBlurEffect } from "./implementations/background-blur";
import { grayscaleEffect } from "./implementations/grayscale";
import { pixelateEffect } from "./implementations/pixelate";
import { textureEffect } from "./implementations/texture";
import { bulgeEffect } from "./implementations/bulge";
import { zoomEffect } from "./implementations/zoom";
import { bloomEffect } from "./implementations/bloom";
import { vintageEffect } from "./implementations/vintage";
import { chromaticAberrationEffect } from "./implementations/chromatic-aberration";
import { skslEffect } from "./implementations/sksl";
import { EffectData } from "./effect-data";


const EFFECTS = new Map<string, EffectData<SceneEffect>>([
    ["blur", blurEffect as EffectData<SceneEffect>],
    ["backgroundBlur", backgroundBlurEffect as EffectData<SceneEffect>],
    ["grayscale", grayscaleEffect as EffectData<SceneEffect>],
    ["pixelate", pixelateEffect as EffectData<SceneEffect>],
    ["texture", textureEffect as EffectData<SceneEffect>],
    ["bulge", bulgeEffect as EffectData<SceneEffect>],
    ["zoom", zoomEffect as EffectData<SceneEffect>],
    ["bloom", bloomEffect as EffectData<SceneEffect>],
    ["vintage", vintageEffect as EffectData<SceneEffect>],
    ["chromaticAberration", chromaticAberrationEffect as EffectData<SceneEffect>],
    ["sksl", skslEffect as EffectData<SceneEffect>],
]);

export function lerpEffect(from: SceneEffect, to: SceneEffect, t: number): SceneEffect {
    if (from.type !== to.type) return t < 0.5 ? from : to;
    const data = EFFECTS.get(from.type);
    return data ? data.lerp(from, to, t) : (t < 0.5 ? from : to);
}

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
