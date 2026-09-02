import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { scene } from "./scene.fixtures";
import type { CanvasKit } from "@motion-script/canvaskit";
import wasmUrl from "@motion-script/canvaskit/canvaskit.wasm?url";
import { Ellipse, Fills, Rect, type Fill } from "@motion-script/core";
import { getCanvasKit } from "../src/getter";
import { createStillRenderer, type StillRenderer } from "../src/still";

/**
 * The custom SkSL shader fill, against real CanvasKit.
 *
 * Two things need a browser to prove, and both are load-bearing:
 *
 * 1. **The uniform reflection API.** The fill marshals values *by name*, using
 *    `getUniformCount`/`getUniformName`/`getUniform`/`getUniformFloatCount` to
 *    find each uniform's float range. Nothing else in the repo calls any of them,
 *    and the whole design rests on `uniform shader` declarations occupying no
 *    uniform slot — so that is asserted directly against the shipped wasm rather
 *    than assumed. `packages/core`'s `sksl-uniforms.test.ts` covers the mapping
 *    itself against a fake; this covers the contract the fake stands in for.
 *
 * 2. **Alpha, once.** `FillHandler` puts `opacity × worldAlpha` on the paint via
 *    `setAlphaf`, and Skia modulates a shader's output by the paint alpha. A
 *    shader-based fill that also folds opacity into its own output renders at the
 *    *square* of what was asked for — which is exactly what `fills/fractal-noise`
 *    did until this suite existed. Both fills are pinned here.
 *
 * Coordinate spaces are checked by pixels rather than by matrix arithmetic (which
 * `coordsMatrix` already unit-tests), because the question a matrix test can't
 * answer is whether `makeShader`'s `localMatrix` composes the way we think.
 */

const VIEWPORT = { width: 64, height: 64 };

/** Red where `fragCoord.x < 8`, blue elsewhere. Distinguishes px coords from unit ones. */
const SPLIT_AT_8 = `
vec4 main(vec2 p) {
    return p.x < 8.0 ? vec4(1.0, 0.0, 0.0, 1.0) : vec4(0.0, 0.0, 1.0, 1.0);
}`;

/** Red where `fragCoord.x < 0`, blue elsewhere. Only a centred space has negatives. */
const SPLIT_AT_0 = `
vec4 main(vec2 p) {
    return p.x < 0.0 ? vec4(1.0, 0.0, 0.0, 1.0) : vec4(0.0, 0.0, 1.0, 1.0);
}`;

/** Opaque white, premultiplied, folding in nothing. */
const WHITE = `
vec4 main(vec2 p) { return vec4(1.0, 1.0, 1.0, 1.0); }`;

/** Declares a sampler, so it can only paint once a texture is bound to it. */
const NEEDS_TEXTURE = `
uniform shader u_photo;
uniform vec2 u_size;
vec4 main(vec2 p) { return u_photo.eval(p * u_size); }`;

let ck: CanvasKit;
let renderer: StillRenderer;

beforeAll(async () => {
    ck = await getCanvasKit(wasmUrl);
    // `getCanvasKit` memoizes, so later creates are cheap.
    const warm = await createStillRenderer({ viewport: VIEWPORT, wasmUrl });
    warm.dispose();
});

afterEach(() => {
    renderer?.dispose();
});

/** Render a full-bleed rect with `fill` and return the frame's pixels. */
async function paint(fill: Fill): Promise<{ pixels: Uint8Array; width: number; height: number }> {
    renderer = await createStillRenderer({ viewport: VIEWPORT, wasmUrl });
    await renderer.render(scene((stage) => stage.add(new Rect({ width: "fill", height: "fill", fill }))));
    return (renderer as any).renderContext.snapshotPixels();
}

type RGBA = [number, number, number, number];

/** The pixel at a fraction across the frame, as [r, g, b, a]. */
function at(
    snapshot: { pixels: Uint8Array; width: number; height: number },
    fx: number,
    fy: number,
): RGBA {
    const { pixels, width, height } = snapshot;
    const x = Math.min(width - 1, Math.floor(fx * width));
    const y = Math.min(height - 1, Math.floor(fy * height));
    const i = (y * width + x) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
}

const isRed = (p: RGBA) => p[0] > 200 && p[2] < 55;
const isBlue = (p: RGBA) => p[2] > 200 && p[0] < 55;

describe("RuntimeEffect uniform reflection", () => {
    it("exposes the four methods the marshaller depends on", () => {
        const effect = ck.RuntimeEffect.Make("uniform float u_a; vec4 main(vec2 p) { return vec4(u_a); }");

        expect(effect).not.toBeNull();
        expect(typeof effect!.getUniformCount).toBe("function");
        expect(typeof effect!.getUniformName).toBe("function");
        expect(typeof effect!.getUniform).toBe("function");
        expect(typeof effect!.getUniformFloatCount).toBe("function");
        expect(effect!.getUniformCount()).toBe(1);
        expect(effect!.getUniformName(0)).toBe("u_a");
        effect!.delete();
    });

    // The single fact the by-name design rests on: Skia keeps uniforms() and
    // children() as separate lists, so a sampler shifts no uniform's slot. If this
    // were false, every uniform after a `uniform shader` would be misplaced.
    it("does not count a `uniform shader` declaration as a uniform", () => {
        const effect = ck.RuntimeEffect.Make(`
            uniform shader u_photo;
            uniform float u_amount;
            vec4 main(vec2 p) { return u_photo.eval(p) * u_amount; }
        `);

        expect(effect).not.toBeNull();
        expect(effect!.getUniformCount()).toBe(1);
        expect(effect!.getUniformName(0)).toBe("u_amount");
        expect(effect!.getUniformFloatCount()).toBe(1);
        effect!.delete();
    });

    it("reports slots and a float count consistent with a mixed float/vec2/vec4/int program", () => {
        const effect = ck.RuntimeEffect.Make(`
            uniform float u_time;
            uniform float2 u_size;
            uniform float4 u_tint;
            uniform int u_seed;
            vec4 main(vec2 p) {
                return u_tint * u_time * float(u_seed) * float(u_size.x + u_size.y + p.x);
            }
        `);
        expect(effect).not.toBeNull();

        const spans: Record<string, { slot: number; floats: number; isInteger: boolean }> = {};
        for (let i = 0; i < effect!.getUniformCount(); i++) {
            const info = effect!.getUniform(i);
            spans[effect!.getUniformName(i)] = {
                slot: info.slot,
                floats: info.columns * info.rows,
                isInteger: !!info.isInteger,
            };
        }

        expect(spans).toEqual({
            u_time: { slot: 0, floats: 1, isInteger: false },
            u_size: { slot: 1, floats: 2, isInteger: false },
            u_tint: { slot: 3, floats: 4, isInteger: false },
            u_seed: { slot: 7, floats: 1, isInteger: true },
        });
        expect(effect!.getUniformFloatCount()).toBe(8);
        effect!.delete();
    });
});

describe("shader fill coordinate spaces", () => {
    // `normalized` maps the bounds onto the unit square, so every fragCoord.x is
    // below 8 and the whole shape takes the red branch.
    it("hands `normalized` a unit-square fragCoord", async () => {
        const frame = await paint(Fills.shader(SPLIT_AT_8, { coords: "normalized" }));

        expect(isRed(at(frame, 0.1, 0.5))).toBe(true);
        expect(isRed(at(frame, 0.9, 0.5))).toBe(true);
    });

    // `local` leaves it in shape-local logical px. The rect spans -32..32 (the
    // canvas origin is its centre), so the x = 8 boundary lands at 62.5% across.
    it("hands `local` shape-local pixels, so the same shader splits at x = 8px", async () => {
        const frame = await paint(Fills.shader(SPLIT_AT_8, { coords: "local" }));

        expect(isRed(at(frame, 0.1, 0.5))).toBe(true);
        expect(isRed(at(frame, 0.5, 0.5))).toBe(true);
        expect(isBlue(at(frame, 0.9, 0.5))).toBe(true);
    });

    // Only a centred space has negative coordinates at all — under `normalized`
    // this same shader is uniformly blue.
    it("puts the origin at the centre for `centered`", async () => {
        const centered = await paint(Fills.shader(SPLIT_AT_0, { coords: "centered" }));

        expect(isRed(at(centered, 0.25, 0.5))).toBe(true);
        expect(isBlue(at(centered, 0.75, 0.5))).toBe(true);

        const normalized = await paint(Fills.shader(SPLIT_AT_0, { coords: "normalized" }));
        expect(isBlue(at(normalized, 0.25, 0.5))).toBe(true);
        expect(isBlue(at(normalized, 0.75, 0.5))).toBe(true);
    });

    it("defaults to `normalized` when coords is omitted", async () => {
        const frame = await paint(Fills.shader(SPLIT_AT_8));

        expect(isRed(at(frame, 0.9, 0.5))).toBe(true);
    });
});

describe("shader fill alpha", () => {
    // Over the opaque black the pass clears to, a 50%-alpha white reads ~128.
    // A fill folding opacity into its own output on top of the paint's setAlphaf
    // would read ~64.
    it("applies the layer's opacity exactly once", async () => {
        const opaque = await paint(Fills.shader(WHITE));
        const half = await paint(Fills.shader(WHITE, { opacity: 0.5 }));

        expect(at(opaque, 0.5, 0.5)[0]).toBeGreaterThan(250);
        expect(at(half, 0.5, 0.5)[0]).toBeGreaterThan(112);
        expect(at(half, 0.5, 0.5)[0]).toBeLessThan(144);
    });

    // The regression guard for the bug this fill's contract was derived from:
    // `fills/fractal-noise` premultiplied `opacity × worldAlpha` into its shader
    // output *and* received the handler's setAlphaf, so 0.5 rendered as 0.25.
    it("applies a fractal-noise fill's opacity exactly once too", async () => {
        const flatWhite = { colors: ["#ffffff", "#ffffff"] };
        const opaque = await paint(Fills.fractalNoise(flatWhite));
        const half = await paint(Fills.fractalNoise({ ...flatWhite, opacity: 0.5 }));

        expect(at(opaque, 0.5, 0.5)[0]).toBeGreaterThan(250);
        expect(at(half, 0.5, 0.5)[0]).toBeGreaterThan(112);
        expect(at(half, 0.5, 0.5)[0]).toBeLessThan(144);
    });
});

describe("shader fill is a fill", () => {
    // The claim that makes this a fill rather than an effect: it is a shader on the
    // paint, so the handler's ordinary path draw confines it. Nothing about an
    // ellipse is special-cased.
    it("clips to a non-rectangular shape's own path", async () => {
        renderer = await createStillRenderer({ viewport: VIEWPORT, wasmUrl });
        await renderer.render(
            scene((stage) =>
                stage.add(new Ellipse({
                    width: "fill", height: "fill", fill: Fills.shader(WHITE),
                })),
            ),
        );
        const frame = (renderer as any).renderContext.snapshotPixels();

        expect(at(frame, 0.5, 0.5)[0]).toBeGreaterThan(250);
        // Outside the inscribed ellipse but inside its bounding box.
        expect(at(frame, 0.02, 0.02)).toEqual([0, 0, 0, 255]);
    });

    // The stroke path calls the fill registry directly, with PaintStyle.Stroke and
    // without ever running `preflight` — which is why this renderer has none.
    it("paints a stroke, not just a fill", async () => {
        renderer = await createStillRenderer({ viewport: VIEWPORT, wasmUrl });
        await renderer.render(
            scene((stage) =>
                stage.add(new Rect({
        width: 40, height: 40, stroke: { weight: 10, fill: Fills.shader(WHITE) },
                })),
            ),
        );
        const frame = (renderer as any).renderContext.snapshotPixels();

        // On the ribbon (the 40x40 box's edge sits 12px from the frame edge).
        expect(at(frame, 0.19, 0.5)[0]).toBeGreaterThan(250);
        // Inside it, where there is no fill.
        expect(at(frame, 0.5, 0.5)).toEqual([0, 0, 0, 255]);
    });
});

describe("shader fill textures", () => {
    // Declining is the same contract an image fill has while it decodes: paint
    // nothing rather than sample transparent black through an unbound child.
    it("declines to paint when a declared sampler has no texture supplied", async () => {
        const frame = await paint(Fills.shader(NEEDS_TEXTURE));

        // The cleared background, not a shaded shape.
        expect(at(frame, 0.5, 0.5)).toEqual([0, 0, 0, 255]);
    });
});
