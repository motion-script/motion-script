import { lerpNumber } from "@/tween/lerp";
import type { EffectData } from "../effect-data";

/**
 * Figma-style background blur. Unlike {@link BlurEffect}, which blurs the node's
 * own content, this blurs whatever is painted *underneath* the node and clips
 * that blur to the node's silhouette — so the node's own edges stay sharp while
 * the backdrop shows through softened.
 */
export interface BackgroundBlurEffect {
    type: "backgroundBlur";
    radius: number;
}

export const backgroundBlurEffect: EffectData<BackgroundBlurEffect> = {
    lerp: (from, to, t) => ({ type: "backgroundBlur", radius: lerpNumber(from.radius, to.radius, t) }),
    equals: (a, b) => a.radius === b.radius,
};
