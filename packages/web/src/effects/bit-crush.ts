import type { EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type BitCrushEffect, type BitCrushPalette } from "@motion-script/core";

/**
 * The fixed hardware palettes, as hex.
 *
 * These are the actual historical colours, not evenly-spaced approximations —
 * the whole point of a palette mode over `posterize` is that the surviving
 * colours are uneven and specific. The DMG's four greens and CGA's high-intensity
 * cyan/magenta are recognisable precisely because no regular quantizer would
 * produce them.
 */
const PALETTES: Record<Exclude<BitCrushPalette, "none">, readonly string[]> = {
    // Game Boy DMG, darkest to lightest.
    gameboy: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
    // IBM CGA palette 1, high intensity.
    cga: ["#000000", "#55ffff", "#ff55ff", "#ffffff"],
    // A representative 16-colour cut of the NES master palette.
    nes: [
        "#000000", "#fcfcfc", "#bcbcbc", "#7c7c7c",
        "#0000fc", "#0078f8", "#3cbcfc", "#a4e4fc",
        "#b8f818", "#00b800", "#005800", "#f83800",
        "#e40058", "#f878f8", "#f8b800", "#503000",
    ],
};

/** `#rrggbb` → an SkSL `vec3` literal in 0–1. */
function toVec3(hex: string): string {
    const n = parseInt(hex.slice(1), 16);
    const channel = (shift: number) => (((n >> shift) & 0xff) / 255).toFixed(4);
    return `vec3(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

/**
 * Colour-depth reduction, either by bit depth or by snapping to a fixed palette.
 *
 * The palette search is **unrolled** into the generated source rather than
 * looped over an array uniform: SkSL's ES2 profile wants constant loop bounds
 * and has no comfortable const-array initialiser, and unrolling 4–16 compares
 * costs nothing next to the texture fetch. One variant compiles per palette.
 *
 * Distance is measured in the same (gamma-encoded) space the content arrives
 * in, so "nearest" matches what the eye sees on screen rather than what is
 * nearest in linear light — which for these deliberately-uneven palettes is the
 * difference between a plausible mapping and a muddy one.
 */
function skslFor(palette: BitCrushPalette): string {
    const crush = palette === "none"
        ? `
    // Even quantization to 2^bits steps per channel.
    float steps = max(exp2(clamp(u_bits, 1.0, 8.0)) - 1.0, 1.0);
    vec3 crushed = floor(base * steps + 0.5) / steps;`
        : `
    // Nearest entry of the ${palette} palette, by squared distance.
    vec3 crushed = ${toVec3(PALETTES[palette][0])};
    float bestDist = dot(base - crushed, base - crushed);
${PALETTES[palette].slice(1).map((hex) => {
            const v = toVec3(hex);
            return `    { vec3 p = ${v}; float d = dot(base - p, base - p);
      if (d < bestDist) { bestDist = d; crushed = p; } }`;
        }).join("\n")}`;

    return `
uniform shader u_content;  // snapshot of the source (premultiplied)
uniform float  u_bits;     // bits per channel (palette 'none' only)
uniform float  u_amount;   // 0–1 blend toward the crushed colour

vec4 main(vec2 fragCoord) {
    vec4 c = u_content.eval(fragCoord);
    if (c.a <= 0.0) return c;

    vec3 base = clamp(c.rgb / c.a, 0.0, 1.0);   // un-premultiply
${crush}

    vec3 out_ = mix(base, crushed, clamp(u_amount, 0.0, 1.0));
    return vec4(out_ * c.a, c.a);               // re-premultiply
}
`;
}

/**
 * Build the paint shader that draws the source colour-crushed. Returns null
 * when the effect is a no-op — no blend, or 8-bit output with no palette, which
 * is already the output depth.
 */
export function makeBitCrushShader(
    effect: BitCrushEffect,
    ck: CanvasKit,
    content: Shader,
): Shader | null {
    if (!(effect.amount > 0)) return null;
    if (effect.palette === "none" && effect.bits >= 8) return null;

    const runtimeEffect = getOrCompileSkSL(skslFor(effect.palette), ck);
    if (!runtimeEffect) return null;

    return runtimeEffect.makeShaderWithChildren([effect.bits, effect.amount], [content]);
}

/** Colour-depth reduction, on the node's own content or on the backdrop. */
export const bitCrushEffectHandler: EffectHandler<BitCrushEffect> = {
    type: "bitCrush",
    sampling: { tileMode: "decal", filterMode: "nearest" },
    makeShader: (effect, ck, content) => makeBitCrushShader(effect, ck, content),
};
