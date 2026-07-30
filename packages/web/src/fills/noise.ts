import type { NoiseFillResolved } from "@motion-script/core";
import { FillRenderer, type FillRendererContext } from "./renderer";

/**
 * Cache key → CanvasKit Image holding the noise tile.
 *
 * Bounded, because `seed` is animatable: a tween walks through a fresh key every
 * frame, so an unbounded map would retain one full-size texture per frame of the
 * animation. Insertion-ordered eviction is the right policy here — the oldest
 * entry is the one a moving seed is least likely to come back to.
 */
const MAX_CACHED_TILES = 24;
const noiseCache = new Map<string, any>();

function cacheTile(key: string, image: any): void {
    noiseCache.set(key, image);
    while (noiseCache.size > MAX_CACHED_TILES) {
        const oldest = noiseCache.keys().next();
        if (oldest.done) break;
        noiseCache.get(oldest.value)?.delete?.();
        noiseCache.delete(oldest.value);
    }
}

function buildCacheKey(fill: NoiseFillResolved, w: number, h: number): string {
    const [r, g, b, a] = fill.color;
    return `${w}x${h}|${fill.size.x},${fill.size.y}|${fill.density}|${fill.seed}|${r},${g},${b},${a}`;
}

/** PCG-style 2D hash — fully decorrelated on both axes. Returns [0, 1). */
function hash2(x: number, y: number, salt: number): number {
    // Mix x and y independently before combining
    let v = (((x * 1664525 + 1013904223) ^ (y * 1664525 * 1664525 + 1013904223)) + salt) >>> 0;
    v ^= v >>> 17;
    v = Math.imul(v, 0x9e3779b9) >>> 0;
    v ^= v >>> 13;
    v = Math.imul(v, 0x6c62272e) >>> 0;
    v ^= v >>> 16;
    return (v >>> 0) / 0x100000000;
}

function generateNoiseData(
    width: number,
    height: number,
    fill: NoiseFillResolved,
): Uint8Array {
    const [cr, cg, cb, ca] = fill.color;
    const gr = Math.round(cr * 255);
    const gg = Math.round(cg * 255);
    const gb = Math.round(cb * 255);
    const ga = Math.round(ca * 255);

    const gx = Math.max(1, Math.round(fill.size.x));
    const gy = Math.max(1, Math.round(fill.size.y));
    const density = Math.min(1, Math.max(0, fill.density));
    // Quantised because the field is regenerated (and re-cached) whenever it
    // changes: a continuously-varying seed would rebuild the tile every frame
    // for a pattern the eye reads as random either way. Whole steps give
    // distinct fields, which is what animating the speckle actually wants.
    const seed = Math.round(fill.seed);

    const data = new Uint8Array(width * height * 4);

    for (let py = 0; py < height; py++) {
        const by = Math.floor(py / gy);
        for (let px = 0; px < width; px++) {
            const bx = Math.floor(px / gx);
            // Two independent hash calls with different salts — no axis correlation
            const rnd = hash2(bx, by, seed);
            const idx = (py * width + px) * 4;
            if (rnd < density) {
                const brightness = hash2(bx, by, seed + 1);
                data[idx]     = Math.round(gr * brightness);
                data[idx + 1] = Math.round(gg * brightness);
                data[idx + 2] = Math.round(gb * brightness);
                data[idx + 3] = ga;
            }
        }
    }

    return data;
}

/**
 * Generates a tiled noise texture sized to the shape's bounds and caches it
 * by (size, grain, density, color) — the same fill reuses the same CKImage
 * across frames as long as its resolved bounds don't change.
 */
export class NoiseFillRenderer extends FillRenderer<NoiseFillResolved> {
    applyPaint(fill: NoiseFillResolved, ctx: FillRendererContext): boolean {
        const bounds = ctx.getShapeBounds();
        const w = bounds ? Math.ceil(bounds.right - bounds.left) : 256;
        const h = bounds ? Math.ceil(bounds.bottom - bounds.top) : 256;

        if (w <= 0 || h <= 0) return false;

        const key = buildCacheKey(fill, w, h);

        let img = noiseCache.get(key);
        if (!img) {
            const pixelData = generateNoiseData(w, h, fill);
            img = ctx.canvasKit.MakeImage(
                {
                    width: w,
                    height: h,
                    alphaType: ctx.canvasKit.AlphaType.Unpremul,
                    colorType: ctx.canvasKit.ColorType.RGBA_8888,
                    colorSpace: ctx.canvasKit.ColorSpace.SRGB,
                },
                pixelData,
                4 * w,
            );
            if (!img) return false;
            cacheTile(key, img);
        }

        const tx = bounds?.left ?? 0;
        const ty = bounds?.top ?? 0;
        // Identity scale — noise fills at 1:1 pixels, translated to shape origin
        const matrix = [1, 0, tx, 0, 1, ty, 0, 0, 1];

        ctx.paint.setShader(
            img.makeShaderOptions(
                ctx.canvasKit.TileMode.Repeat,
                ctx.canvasKit.TileMode.Repeat,
                ctx.canvasKit.FilterMode.Nearest,
                ctx.canvasKit.MipmapMode.None,
                matrix,
            ),
        );
        return true;
    }
}
