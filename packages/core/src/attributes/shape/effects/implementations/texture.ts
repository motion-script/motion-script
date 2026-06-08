import { lerpVector2, Vector2 } from "@/attributes/layout/vector2";
import { lerpNumber } from "@/tween/lerp";
import type { EffectData } from "../effect-data";

export interface TextureEffect {
    type: 'texture';
    size: Vector2;
    radius: number;
}

export const textureEffect: EffectData<TextureEffect> = {
    lerp: (from, to, t) => ({
        type: "texture",
        size: lerpVector2(from.size, to.size, t),
        radius: lerpNumber(from.radius, to.radius, t),
    }),
    equals: (a, b) => a.size.x === b.size.x && a.size.y === b.size.y && a.radius === b.radius,
};
