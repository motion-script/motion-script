import type { EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type RgbShiftEffect } from "@motion-script/core";

/**
 * Per-channel spatial offset: sample the source three times and keep one
 * channel from each.
 *
 * Alpha is the **max** of the three taps rather than the centre's. Taking the
 * centre would clip whichever channel was displaced outward past the
 * silhouette, so a red fringe would vanish exactly where it is most visible —
 * at the edge. Max keeps every displaced channel that has something to show,
 * which is why the fringe survives the node boundary.
 *
 * Each channel is un-premultiplied against its own tap's alpha before being
 * kept, so a channel sampled from a semi-transparent region contributes its
 * true colour rather than a darkened one.
 */
const RGB_SHIFT_SKSL = `
uniform shader u_content;  // snapshot of the source (premultiplied)
uniform vec2   u_red;      // red plane offset, device px
uniform vec2   u_green;    // green plane offset, device px
uniform vec2   u_blue;     // blue plane offset, device px

// Straight (un-premultiplied) colour of one tap, plus its alpha.
vec4 tap(vec2 p) {
    vec4 c = u_content.eval(p);
    return c.a > 0.0 ? vec4(c.rgb / c.a, c.a) : vec4(0.0);
}

vec4 main(vec2 fragCoord) {
    vec4 r = tap(fragCoord - u_red);
    vec4 g = tap(fragCoord - u_green);
    vec4 b = tap(fragCoord - u_blue);

    float a = max(r.a, max(g.a, b.a));
    if (a <= 0.0) return vec4(0.0);

    vec3 straight = vec3(r.r, g.g, b.b);
    return vec4(straight * a, a);   // re-premultiply
}
`;

/**
 * Build the paint shader that draws the source with its colour planes pulled
 * apart. Returns null when every offset is zero (nothing to separate).
 *
 * Offsets are authored in logical px; `scale` lifts them into device space so
 * the fringe tracks the node instead of the screen.
 */
export function makeRgbShiftShader(
    effect: RgbShiftEffect,
    ck: CanvasKit,
    content: Shader,
    scale: number,
): Shader | null {
    const { red, green, blue } = effect;
    const still = red.x === 0 && red.y === 0
        && green.x === 0 && green.y === 0
        && blue.x === 0 && blue.y === 0;
    if (still) return null;

    const runtimeEffect = getOrCompileSkSL(RGB_SHIFT_SKSL, ck);
    if (!runtimeEffect) return null;

    return runtimeEffect.makeShaderWithChildren(
        [
            red.x * scale, red.y * scale,
            green.x * scale, green.y * scale,
            blue.x * scale, blue.y * scale,
        ],
        [content],
    );
}

/** Per-channel RGB offset, on the node's own content or on the backdrop. */
export const rgbShiftEffectHandler: EffectHandler<RgbShiftEffect> = {
    type: "rgbShift",
    sampling: { tileMode: "decal", filterMode: "linear" },
    makeShader: (effect, ck, content, geom) => makeRgbShiftShader(effect, ck, content, geom.scale),
};
