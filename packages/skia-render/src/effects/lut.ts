import type { CanvasKit, Image as CKImage, Shader } from "@motion-script/canvaskit";
import type { LutEffect } from "@motion-script/core";
import { getOrCompileSkSL } from "../sksl-cache";
import type { EffectHandler } from "./handler";

/**
 * A 3D colour lookup table, applied per pixel.
 *
 * ## The cube is a strip
 *
 * Skia has no 3D texture, so the cube is unrolled into a 2D image the way every
 * real-time LUT implementation does it: `size` tiles laid left to right, each
 * one an `size × size` slice at a fixed blue. Texel `(r + b·size, g)` holds the
 * output for input `(r, g, b)`.
 *
 * That layout is what makes the lookup cheap. Red and green interpolate for free
 * — the image shader is created with linear filtering, so sampling at a
 * fractional texel *is* the bilinear tap — and only blue has to be interpolated
 * by hand, between two slices. Two texture reads and a `mix`, rather than the
 * eight reads a hand-written trilinear would need.
 *
 * The one hazard in the layout is bleeding across a tile edge: a sample near the
 * right of slice `b` must not pick up slice `b+1`'s red-zero column. It cannot,
 * because the shader samples at texel *centres* — red maps to `[0.5, size-0.5]`
 * inside the tile, and linear filtering at `size-0.5` weights the last texel
 * fully.
 *
 * ## Eight bits, on purpose
 *
 * The strip is `RGBA_8888`. CanvasKit exposes `RGBA_F16`/`F32`, but linear
 * filtering of float textures is not universally available across the backends
 * this renders on — and it would buy precision the pipeline immediately spends,
 * since the surface being drawn to is 8-bit either way. A LUT quantised to 256
 * levels per channel and interpolated is what a grading tool's GPU preview does.
 *
 * ## Caching
 *
 * Baking is per-table, not per-frame, keyed on the `Float32Array`'s **identity**
 * — the reason {@link LutEffect} promises to hand back the same array (see its
 * docblock). A `WeakMap` so a cube dropped from the scene takes its texture with
 * it, plus a `Set` so `dispose` can free what is still live when the draw context
 * goes away.
 */

interface Baked {
    image: CKImage;
    shader: Shader;
}

let baked = new WeakMap<Float32Array, Baked>();
const live = new Set<Baked>();

/**
 * The cube as a child shader, or null if the image could not be made.
 *
 * `size³` is trusted only as far as the table actually goes: a table shorter
 * than its declared size is a parse bug upstream, and reading past it would give
 * the strip a garbage tail rather than an obvious failure. Missing entries are
 * left black, which reads as an obviously wrong LUT rather than a subtly wrong
 * one.
 */
function bake(effect: LutEffect, ck: CanvasKit): Shader | null {
    const cached = baked.get(effect.table);
    if (cached) return cached.shader;

    const n = effect.size;
    if (!Number.isInteger(n) || n < 2) return null;

    const width = n * n;
    const height = n;
    const bytes = new Uint8Array(width * height * 4);

    for (let b = 0; b < n; b++) {
        for (let g = 0; g < n; g++) {
            for (let r = 0; r < n; r++) {
                const src = ((b * n + g) * n + r) * 3;
                if (src + 2 >= effect.table.length) continue;
                const dst = ((g * width) + (b * n + r)) * 4;
                bytes[dst] = toByte(effect.table[src]);
                bytes[dst + 1] = toByte(effect.table[src + 1]);
                bytes[dst + 2] = toByte(effect.table[src + 2]);
                bytes[dst + 3] = 255;
            }
        }
    }

    const image = ck.MakeImage(
        {
            width,
            height,
            // Unpremultiplied: these are lookup *values*, not colours being
            // composited. Declaring them premultiplied would have Skia divide
            // through by an alpha that means nothing here.
            alphaType: ck.AlphaType.Unpremul,
            colorType: ck.ColorType.RGBA_8888,
            colorSpace: ck.ColorSpace.SRGB,
        },
        bytes,
        width * 4,
    );
    if (!image) return null;

    // Clamp, not repeat: a sample past the edge of the strip is a colour outside
    // the cube's domain, and the nearest entry is the only honest answer. Linear
    // is what makes red and green interpolate for free.
    const shader = image.makeShaderOptions(
        ck.TileMode.Clamp,
        ck.TileMode.Clamp,
        ck.FilterMode.Linear,
        ck.MipmapMode.None,
    );

    const entry: Baked = { image, shader };
    baked.set(effect.table, entry);
    live.add(entry);
    return shader;
}

/** 0–1 float to an 8-bit level, clamped — a `.cube` may hold values outside the range. */
function toByte(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(255, Math.round(value * 255)));
}

const LUT_SKSL = `
uniform shader u_content;
uniform shader u_lut;
uniform float  u_size;
uniform float  u_amount;

vec3 lookup(vec3 c) {
    float n = u_size;
    vec3 q = clamp(c, 0.0, 1.0) * (n - 1.0);

    float b0 = floor(q.b);
    float b1 = min(b0 + 1.0, n - 1.0);
    float fb = q.b - b0;

    // Texel centres inside a tile: red spans [0.5, n-0.5], so linear filtering
    // interpolates red and green and never reaches the neighbouring slice.
    vec2 uv = vec2(q.r + 0.5, q.g + 0.5);

    vec3 lo = u_lut.eval(vec2(uv.x + b0 * n, uv.y)).rgb;
    vec3 hi = u_lut.eval(vec2(uv.x + b1 * n, uv.y)).rgb;
    return mix(lo, hi, fb);
}

vec4 main(vec2 p) {
    vec4 src = u_content.eval(p);
    // Nothing to grade, and dividing by zero alpha would make a NaN that spreads.
    if (src.a <= 0.0) return src;

    // The lookup is defined on straight colour; the shader is handed (and must
    // return) premultiplied.
    vec3 rgb = src.rgb / src.a;
    vec3 graded = mix(rgb, lookup(rgb), clamp(u_amount, 0.0, 1.0));
    return vec4(graded * src.a, src.a);
}
`;

export const lutEffectHandler: EffectHandler<LutEffect> = {
    type: "lut",
    // Nearest would quantise the *source* before it is looked up, throwing away
    // the precision the interpolation exists to preserve.
    sampling: { tileMode: "clamp", filterMode: "linear" },

    resources(effect, ck) {
        const shader = bake(effect, ck);
        return shader ? [shader] : null;
    },

    makeShader(effect, ck, content, _geom, extra) {
        // A grade at zero is the ungraded image — cheaper to decline than to run
        // a shader that provably changes nothing.
        if (effect.amount <= 0) return null;
        const lut = extra?.[0];
        // The bake failed or hasn't happened. Declining leaves the source
        // untouched, which is the same contract an undecoded image fill has.
        if (!lut) return null;

        const rte = getOrCompileSkSL(LUT_SKSL, ck);
        if (!rte) return null;
        return rte.makeShaderWithChildren(
            [effect.size, effect.amount],
            [content, lut],
        );
    },

    dispose() {
        for (const { image, shader } of live) {
            shader.delete();
            image.delete();
        }
        live.clear();
        // Replaced rather than cleared: CanvasKit is a module-level singleton, so
        // the next draw context would otherwise be handed shaders already freed.
        baked = new WeakMap();
    },
};
