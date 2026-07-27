import type { EffectHandler } from "./handler";
import { resolveEffectColor, type DuotoneEffect } from "@motion-script/core";

// ITU-R BT.709 luminance weights.
const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

/**
 * The 4×5 colour matrix for a luminance ramp between two colours.
 *
 * A gradient map is affine in the source channels, so it needs no shader:
 *
 *   out = lerp(c, shadows + luma(c)·(highlights − shadows), amount)
 *
 * Expanding `luma(c) = LR·R + LG·G + LB·B` gives, per output channel `i` with
 * `dᵢ = highlightsᵢ − shadowsᵢ`:
 *
 *   outᵢ = (1 − a)·cᵢ + a·dᵢ·(LR·R + LG·G + LB·B) + a·shadowsᵢ
 *
 * — the `(1 − a)` term landing on the diagonal, the `a·dᵢ·L*` terms filling the
 * row, and `a·shadowsᵢ` in the constant column. Skia applies colour matrices to
 * *unpremultiplied* colour and leaves the alpha row to us, so alpha stays
 * identity and the ramp never touches the silhouette.
 *
 * The ramp colours' own alpha is ignored: they name the two ends of a tone
 * scale, not translucent inks.
 *
 * Exported for unit testing; the handler below is the only runtime caller.
 */
export function duotoneMatrix(
    amount: number,
    shadows: readonly number[],
    highlights: readonly number[],
): number[] {
    const a = Math.max(0, Math.min(1, amount));
    const row = (i: number) => {
        const d = (highlights[i] - shadows[i]) * a;
        return [d * LR, d * LG, d * LB, 0, shadows[i] * a];
    };

    const [r, g, b] = [row(0), row(1), row(2)];
    // Add the surviving fraction of the original colour on the diagonal.
    r[0] += 1 - a;
    g[1] += 1 - a;
    b[2] += 1 - a;

    return [...r, ...g, ...b, 0, 0, 0, 1, 0];
}

/**
 * Duotone / gradient map — luminance remapped onto a two-colour ramp via a
 * single colour-matrix ImageFilter, so it composes cheaply with its neighbours
 * in the chain.
 */
export const duotoneEffectHandler: EffectHandler<DuotoneEffect> = {
    type: "duotone",

    makeImageFilter(effect, ck) {
        if (effect.amount <= 0) return null;

        const matrix = duotoneMatrix(
            effect.amount,
            resolveEffectColor(effect.shadows),
            resolveEffectColor(effect.highlights),
        );

        const cf = ck.ColorFilter.MakeMatrix(matrix);
        const result = ck.ImageFilter.MakeColorFilter(cf, null);
        cf.delete();
        return result;
    },
};
