import type { EffectHandler } from "./handler";
import type { CanvasKit, Image as CKImage, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type DitherEffect } from "@motion-script/core";
import { BLUE_NOISE_SIZE, blueNoiseBytes } from "./blue-noise";
import { patternOrigin } from "./pattern-origin";

/**
 * Ordered dithering: quantize to `levels` tones per channel, but offset each
 * pixel's rounding by a threshold pattern so the quantization error becomes
 * texture instead of a visible band.
 *
 *   out = floor(v·(L−1) + threshold) / (L−1),   threshold ∈ [0,1)
 *
 * Only where the threshold comes from differs between the two `noise` modes; the
 * quantization above is identical, which is why they reproduce the same tones.
 *
 * **Bayer.** The 2×2 base matrix comes out of a two-line identity rather than a
 * table: `fract(x/2 + y²·¾)` enumerates {0, ½, ¾, ¼} over the four cells, which
 * is exactly Bayer's [[0,2],[3,1]]/4. The 4×4 and 8×8 matrices are then the
 * standard recursion — a coarser copy of the pattern, quarter-weighted, plus the
 * 2×2 detail on top. The lattice this produces *is* the retro look, and is also
 * why it can beat against the pixel grid at some `scale`s.
 *
 * **Blue noise.** A 64×64 void-and-cluster table, sampled per cell and tiled.
 * Every threshold level is homogeneously distributed, so there is no lattice to
 * see and nothing for the pixel grid to beat against — the same tones, rendered
 * as texture rather than as pattern.
 *
 * The mode and matrix size are baked into the source (four variants, cached by
 * `getOrCompileSkSL`) so the shader isn't paying to evaluate all of them behind
 * a uniform branch.
 *
 * Cells are counted from the **node's own corner** rather than from the screen's
 * — see {@link patternOrigin}. A lattice measured in device pixels is one the
 * node slides through as it moves, so animating a dithered node's position made
 * the pattern crawl across it; measured from the node, the screen is a print of
 * the node and the dots stay put on it.
 */
function skslFor(noise: DitherEffect["noise"], matrix: 2 | 4 | 8): string {
    const blue = noise === "blue";

    const threshold = blue
        // The table holds 0..255 over its 64×64 period; `mod` tiles it, and the
        // child shader samples with Nearest so a cell gets one exact level.
        ? `u_noise.eval(mod(cell, ${BLUE_NOISE_SIZE}.0) + 0.5).r`
        : matrix === 2
            ? "bayer2(cell)"
            : matrix === 4
                ? "bayer2(cell * 0.5) * 0.25 + bayer2(cell)"
                : "(bayer2(cell * 0.25) * 0.25 + bayer2(cell * 0.5)) * 0.25 + bayer2(cell)";

    return `
uniform shader u_content;     // snapshot of the source (premultiplied)
${blue ? "uniform shader u_noise;       // 64x64 blue-noise thresholds, tiled\n" : ""}uniform vec2   u_origin;      // node box top-left, device px (0,0 on a backdrop)
uniform float  u_levels;      // output tones per channel (>= 2)
uniform float  u_scale;       // pattern cell size, device px
uniform float  u_monochrome;  // 1 = dither luminance, 0 = per channel

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
${blue ? "" : `
/** Bayer 2×2 threshold in [0,1) for an integer cell coordinate. */
float bayer2(vec2 c) {
    vec2 a = floor(c);
    return fract(a.x * 0.5 + a.y * a.y * 0.75);
}
`}
vec4 main(vec2 fragCoord) {
    vec4 c = u_content.eval(fragCoord);
    if (c.a <= 0.0) return c;

    vec2 cell = floor((fragCoord - u_origin) / max(u_scale, 1.0));
    float threshold = ${threshold};

    vec3 base = c.rgb / c.a;                       // un-premultiply
    if (u_monochrome > 0.5) base = vec3(dot(base, LUMA));

    float steps = max(u_levels, 2.0) - 1.0;
    vec3 dithered = clamp(floor(base * steps + threshold) / steps, 0.0, 1.0);
    return vec4(dithered * c.a, c.a);              // re-premultiply
}
`;
}

/**
 * The blue-noise table as a tiled shader, built once per CanvasKit instance.
 *
 * Not routed through `EffectHandler.resources`: the table is a compile-time
 * constant, not something derived from the draw's fonts or surface, so building
 * it here keeps the effect working on every path — including an image fill,
 * whose context may have no bake resources at all.
 */
interface NoiseTexture { image: CKImage; shader: Shader }

let noiseCache = new WeakMap<CanvasKit, NoiseTexture | null>();
/** Live entries, so `dispose()` can free them — a WeakMap isn't enumerable. */
const noiseTextures = new Set<NoiseTexture>();

function blueNoiseShader(ck: CanvasKit): Shader | null {
    const cached = noiseCache.get(ck);
    if (cached !== undefined) return cached?.shader ?? null;

    // Stored one byte per cell and expanded here. RGBA_8888 / Unpremul / SRGB is
    // the format every other generated texture in the renderer uses, and it is
    // the one that round-trips a stored number unchanged: an unpremultiplied
    // opaque pixel is not scaled by its own alpha, and sRGB-tagged into an
    // sRGB destination is identity. The value is read back as `.r`.
    const bytes = blueNoiseBytes();
    const rgba = new Uint8Array(bytes.length * 4);
    for (let i = 0; i < bytes.length; i++) {
        const v = bytes[i];
        rgba[i * 4] = v;
        rgba[i * 4 + 1] = v;
        rgba[i * 4 + 2] = v;
        rgba[i * 4 + 3] = 255;
    }

    const image = ck.MakeImage(
        {
            width: BLUE_NOISE_SIZE,
            height: BLUE_NOISE_SIZE,
            alphaType: ck.AlphaType.Unpremul,
            colorType: ck.ColorType.RGBA_8888,
            colorSpace: ck.ColorSpace.SRGB,
        },
        rgba,
        4 * BLUE_NOISE_SIZE,
    );
    if (!image) {
        // Cache the failure: retrying the upload every frame would be worse than
        // the Bayer fallback the caller drops to.
        noiseCache.set(ck, null);
        return null;
    }

    const shader = image.makeShaderOptions(
        ck.TileMode.Repeat, ck.TileMode.Repeat, ck.FilterMode.Nearest, ck.MipmapMode.None,
    );
    const entry = { image, shader };
    noiseCache.set(ck, entry);
    noiseTextures.add(entry);
    return shader;
}

/**
 * Build the paint shader that draws the source dithered. Returns null when
 * `levels` is high enough that quantization is a no-op — past 256 tones per
 * channel there is nothing left to round in 8-bit output.
 */
export function makeDitherShader(
    effect: DitherEffect,
    ck: CanvasKit,
    content: Shader,
    scale: number,
    origin: readonly [number, number] = [0, 0],
): Shader | null {
    if (effect.levels >= 256) return null;

    // Blue noise needs its table; if the upload failed there is nothing to
    // sample, so fall back to the ordered matrix rather than dropping the
    // effect — same tones, just with the lattice back.
    const noiseShader = effect.noise === "blue" ? blueNoiseShader(ck) : null;
    const noise = effect.noise === "blue" && noiseShader ? "blue" : "bayer";

    const runtimeEffect = getOrCompileSkSL(skslFor(noise, effect.matrix), ck);
    if (!runtimeEffect) return null;

    const children = noise === "blue" ? [content, noiseShader!] : [content];
    return runtimeEffect.makeShaderWithChildren(
        [
            origin[0], origin[1],
            effect.levels, Math.max(effect.scale * scale, 1), effect.monochrome ? 1 : 0,
        ],
        children,
    );
}

/** Ordered dithering, on the node's own content or on the backdrop beneath it. */
export const ditherEffectHandler: EffectHandler<DitherEffect> = {
    type: "dither",
    sampling: { tileMode: "decal", filterMode: "nearest" },
    makeShader: (effect, ck, content, geom) =>
        makeDitherShader(effect, ck, content, geom.scale, patternOrigin(effect, geom)),
    dispose() {
        for (const { image, shader } of noiseTextures) {
            shader.delete();
            image.delete();
        }
        noiseTextures.clear();
        // Replace rather than leave: CanvasKit is a module-level singleton, so
        // the *next* draw context gets the same key back and would otherwise be
        // handed a shader that has already been deleted.
        noiseCache = new WeakMap();
    },
};
