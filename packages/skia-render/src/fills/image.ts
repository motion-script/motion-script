import type { ImageFillResolved, MediaFilter } from "@motion-script/core";
import { isPixelFilter } from "@motion-script/core";
import type { Image as CKImage, Shader } from "@motion-script/canvaskit";
import { FillRenderer, type FillRendererContext } from "./renderer";
import { type ShapeBounds } from "./handler";
import { EffectRegistry } from "../effects/registry";
import type { EffectGeometry } from "../effects/handler";

/** Shades with the adapter-decoded image and applies the fill's filter chain. */
export class ImageFillRenderer extends FillRenderer<ImageFillResolved> {
    applyPaint(fill: ImageFillResolved, ctx: FillRendererContext): boolean {
        if (!fill.src) return false;
        const img = ctx.assets.getCKImage(fill.src);
        if (!img) return false;
        // Adapter-owned CKImage — do NOT push to transientImages (which gets
        // .delete()'d after the draw). The adapter releases the texture when
        // the underlying pixels are evicted.
        const base = makeImageShader(img, fill, ctx.canvasKit, ctx.getShapeBounds(), samplingFor(fill));
        ctx.paint.setShader(applyMediaFilters(fill, ctx, base));
        return true;
    }
}

/**
 * The box a fill's filter chain runs against.
 *
 * A paint shader is evaluated in the drawn shape's own **local** coordinates,
 * which is also the space `getShapeBounds()` reports and the space the image
 * shader's matrix maps into — so an authored px is a logical px here and the
 * CTM scales the whole thing afterwards. That is exactly the ImageFilter path's
 * convention (`scale: 1`), which is what keeps `ImageFilters.blur(8)` and
 * `ImageFilters.dither({ scale: 8 })` meaning the same size on screen.
 */
function fillGeometry(bounds: ShapeBounds | null, elapsed: number): EffectGeometry {
    return {
        centerX: bounds ? (bounds.left + bounds.right) / 2 : 0,
        centerY: bounds ? (bounds.top + bounds.bottom) / 2 : 0,
        width: bounds ? bounds.right - bounds.left : 0,
        height: bounds ? bounds.bottom - bounds.top : 0,
        scale: 1,
        time: elapsed,
        // A media filter is applied to the fill's own pixels — it has no node
        // motion of its own, which is why `motionBlur` and `trails` are not
        // filters at all (see `EffectFilter` in core).
        velocity: { x: 0, y: 0 },
        angularVelocity: 0,
    };
}

/**
 * How the fill's own shader should sample, given the chain that wraps it.
 *
 * The innermost lens reads the fill's texels directly, so its declared sampling
 * is the one that matters: a `nearest` filter (dither, bit-crush) blurs into
 * mush if the texture beneath it is being bilinearly resampled.
 */
export function samplingFor(fill: { filters?: { type: string }[] }): "linear" | "nearest" | undefined {
    for (const filter of fill.filters ?? []) {
        const handler = EffectRegistry.resolveShader(filter, "foreground");
        if (handler) return handler.sampling?.filterMode;
    }
    return undefined;
}

/**
 * Apply the fill's pixel filters and return the shader the paint should use.
 *
 * Filters take one of two render paths, exactly as scene effects do — the split
 * is `EffectSurface` in core, and one handler registry serves both:
 *
 * - **Colour transforms** (exposure, curves, duotone, …) compose into a single
 *   Skia `ImageFilter` on the paint, in array order.
 * - **Position resamplers** (oilPaint, dither, halftone, twirl, …) need random
 *   access to their source, so each one *wraps* the fill's shader in a lens —
 *   which is what makes them work here at all. A scene effect gets its source by
 *   snapshotting the node into an offscreen surface; a fill already *is* a
 *   shader, so the same handler can read it directly with no offscreen at all.
 *
 * The two runs are applied in author order within themselves, but a lens always
 * runs before the composed `ImageFilter`, because Skia applies a paint's image
 * filter to whatever its shader produced and CanvasKit exposes no way to feed an
 * `ImageFilter`'s output back in as a child shader. So
 * `ImageFilters.oilPaint(4).grayscale(1)` is honoured exactly, while
 * `.grayscale(1).oilPaint(4)` also paints brushwork over grey — the difference
 * being whether the brush windows saw colour. Order the chain resamplers-first
 * when it matters.
 *
 * Video-only filters (`posterizeTime`, `echo`) are skipped here — they are
 * handled by the video fill's per-frame update or a dedicated multi-pass draw.
 * Callers (FillHandler) clear the image filter and free `transientShaders`
 * after drawing.
 */
export function applyMediaFilters(
    fill: { filters?: { type: string }[] },
    ctx: FillRendererContext,
    content: Shader,
): Shader {
    const pixel = (fill.filters ?? []).filter((f): f is MediaFilter => isPixelFilter(f.type));
    if (pixel.length === 0) {
        ctx.paint.setImageFilter(null);
        return content;
    }

    const geom = fillGeometry(ctx.getShapeBounds(), ctx.elapsed);
    const composable: MediaFilter[] = [];
    let shader = content;

    for (const filter of pixel) {
        const handler = EffectRegistry.resolveShader(filter, "foreground");
        if (!handler) {
            composable.push(filter);
            continue;
        }
        const resources = ctx.effectResources();
        const extra = (resources && handler.resources?.(filter, ctx.canvasKit, resources)) ?? [];
        const lens = handler.makeShader!(filter, ctx.canvasKit, shader, geom, extra);
        // A null lens is the effect's own "no-op at these settings" answer (zero
        // radius, zero amount) — the state every tween-it-on-from-nothing starts
        // in. Keep shading with the source rather than dropping the fill.
        if (!lens) continue;
        ctx.transientPaintObjects.push(lens);
        shader = lens;
    }

    const composed = composable.length > 0
        ? EffectRegistry.compose(composable, ctx.canvasKit, geom)
        : null;
    if (composed) ctx.transientPaintObjects.push(composed);
    ctx.paint.setImageFilter(composed);
    // An image filter's output escapes the geometry it was computed from — see
    // `clipFilterToShape`. The lens run needs no such help.
    ctx.clipFilterToShape = composed != null;
    return shader;
}

/**
 * Compute the image→canvas transform (3×3 matrix as a 9-tuple, row-major)
 * for a given fill descriptor and the destination bounds. This is exactly the
 * same matrix used by the image shader, so contour paths transformed by it
 * land on the visible image's pixel positions.
 */
export function computeImageMatrix(
    imgW: number,
    imgH: number,
    fill: { mode?: string; transform?: Float32Array | number[][]; scaling?: number },
    bounds: ShapeBounds | null,
): number[] {
    if (fill.transform) {
        if (fill.transform instanceof Float32Array) return Array.from(fill.transform);
        return (fill.transform as number[][]).flat();
    }
    if (bounds) {
        const mode = fill.mode ?? "fill";
        const shapeW = bounds.right - bounds.left;
        const shapeH = bounds.bottom - bounds.top;
        let sx: number, sy: number, tx: number, ty: number;
        if (mode === "fit") {
            // Contain: scale uniformly so the whole image fits, letterboxing.
            const scale = Math.min(shapeW / imgW, shapeH / imgH);
            sx = scale; sy = scale;
            tx = bounds.left + (shapeW - imgW * scale) / 2;
            ty = bounds.top + (shapeH - imgH * scale) / 2;
        } else if (mode === "stretch") {
            // Distort each axis independently to fill the bounds exactly.
            sx = shapeW / imgW; sy = shapeH / imgH;
            tx = bounds.left; ty = bounds.top;
        } else if (mode === "tile") {
            sx = (fill as any).scaling ?? 1; sy = (fill as any).scaling ?? 1;
            tx = bounds.left; ty = bounds.top;
        } else {
            // "fill" (default): cover — scale uniformly to fill the bounds,
            // cropping the overflow with the image centered (Figma-style).
            const scale = Math.max(shapeW / imgW, shapeH / imgH);
            sx = scale; sy = scale;
            tx = bounds.left + (shapeW - imgW * scale) / 2;
            ty = bounds.top + (shapeH - imgH * scale) / 2;
        }
        return [sx, 0, tx, 0, sy, ty, 0, 0, 1];
    }
    const s = (fill as any).scaling ?? 1;
    return [s, 0, 0, 0, s, 0, 0, 0, 1];
}

/**
 * Shared image-shader builder used by both image and video renderers.
 *
 * `filterMode` overrides the default bilinear sampling — see {@link samplingFor}
 * for why a filter chain gets to choose it.
 */
export function makeImageShader(
    img: CKImage,
    fill: { mode?: string; transform?: Float32Array | number[][]; scaling?: number },
    ck: any,
    bounds: ShapeBounds | null,
    filterMode: "linear" | "nearest" = "linear",
): any {
    const mode = fill.mode ?? "fill";
    // 'tile' repeats; 'fit' leaves letterbox margins that must stay transparent
    // (Decal) rather than smearing edge pixels; 'fill'/'stretch' cover the rect
    // so Clamp never shows.
    const tileMode = mode === "tile"
        ? ck.TileMode.Repeat
        : mode === "fit"
            ? ck.TileMode.Decal
            : ck.TileMode.Clamp;

    const matrix = computeImageMatrix(img.width(), img.height(), fill, bounds);

    return img.makeShaderOptions(
        tileMode,
        tileMode,
        filterMode === "nearest" ? ck.FilterMode.Nearest : ck.FilterMode.Linear,
        ck.MipmapMode.None,
        matrix,
    );
}
