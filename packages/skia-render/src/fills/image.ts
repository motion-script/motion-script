import type { ImageFillResolved, MediaAdjustment } from "@motion-script/core";
import { AssetNotLoadedError, isPixelFilter } from "@motion-script/core";
import type { Image as CKImage, Shader } from "@motion-script/canvaskit";
import { FillRenderer, type FillRendererContext } from "./renderer";
import { type ShapeBounds } from "./handler";
import { EffectRegistry } from "../effects/registry";
import type { EffectGeometry } from "../effects/handler";
import { getOrCompileSkSL } from "../sksl-cache";

/** Shades with the adapter-decoded image and applies the fill's filter chain. */
export class ImageFillRenderer extends FillRenderer<ImageFillResolved> {
    applyPaint(fill: ImageFillResolved, ctx: FillRendererContext): boolean {
        // A fill with no src isn't a missing asset, it's an unset one — the
        // author hasn't chosen a picture yet. Nothing to paint, nothing wrong.
        if (!fill.src) return false;
        const img = ctx.assets.getCKImage(fill.src);
        // Undeclared, or declared for a window that doesn't cover this frame.
        // Skipping the layer here is how a photo used to go missing without
        // anything saying so; see `AssetNotLoadedError`.
        if (!img) throw new AssetNotLoadedError("image", fill.src);
        // Adapter-owned CKImage — do NOT push to transientImages (which gets
        // .delete()'d after the draw). The adapter releases the texture when
        // the underlying pixels are evicted.
        const base = makeImageShader(img, fill, ctx.canvasKit, ctx.getShapeBounds(), samplingFor(fill));
        // The wrapping shader *is* ours, unlike the image beneath it — freed after
        // the shapes are drawn and after the paint is cleared, since the paint
        // holds its own reference until then.
        ctx.transientPaintObjects.push(base);
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
 * convention (`scale: 1`), which is what keeps `Adjustments.blur(8)` and
 * `Adjustments.dither({ scale: 8 })` meaning the same size on screen.
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
        // filters at all (see `EffectAdjustment` in core).
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
export function samplingFor(fill: GradedFill): "linear" | "nearest" | undefined {
    for (const filter of fill.preset?.adjustments ?? []) {
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
 * `Adjustments.oilPaint(4).grayscale(1)` is honoured exactly, while
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
    fill: GradedFill,
    ctx: FillRendererContext,
    content: Shader,
): Shader {
    const intensity = fill.preset?.intensity ?? 1;
    const pixel = (fill.preset?.adjustments ?? []).filter(
        (f): f is MediaAdjustment => isPixelFilter(f.type),
    );
    // A grade dialled to nothing is not a grade with tiny numbers — it is the
    // ungraded fill, and taking the cheap path here is what makes `intensity: 0`
    // cost the same as no preset at all.
    if (pixel.length === 0 || intensity <= 0) {
        ctx.paint.setImageFilter(null);
        return content;
    }

    const geom = fillGeometry(ctx.getShapeBounds(), ctx.elapsed);
    const composable: MediaAdjustment[] = [];
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

    // The lens half of the mix. `shader === content` when every adjustment in
    // the chain composed instead, in which case there is nothing to cross-fade.
    if (intensity < 1 && shader !== content) {
        const mixed = mixShaders(content, shader, intensity, ctx);
        if (mixed) {
            ctx.transientPaintObjects.push(mixed);
            shader = mixed;
        }
    }

    const composed = composable.length > 0
        ? EffectRegistry.compose(composable, ctx.canvasKit, geom)
        : null;
    if (composed) ctx.transientPaintObjects.push(composed);
    const graded = intensity < 1 && composed
        ? fadeImageFilter(composed, intensity, ctx)
        : composed;
    if (graded && graded !== composed) ctx.transientPaintObjects.push(graded);
    ctx.paint.setImageFilter(graded);
    // An image filter's output escapes the geometry it was computed from — see
    // `clipFilterToShape`. The lens run needs no such help.
    ctx.clipFilterToShape = graded != null;
    return shader;
}

/**
 * The fill shape `applyMediaFilters` and `samplingFor` actually read: a grade,
 * or nothing. Structural rather than `ImageFillResolved`, because the video fill
 * hands in its own resolved type and the multi-tap echo path hands in a subset.
 */
export interface GradedFill {
    preset?: { adjustments: { type: string }[]; intensity: number };
}

/**
 * Cross-fade two premultiplied shaders.
 *
 * A `mix` in SkSL rather than a Skia blend, because there is no blend mode that
 * means "interpolate": the nearest thing, drawing the graded copy over the
 * ungraded one at reduced alpha, is only equal to a lerp where the content is
 * opaque, and a fill's antialiased rim is exactly where it isn't. Premultiplied
 * colours interpolate linearly, so the one-line shader is also the exact answer.
 */
function mixShaders(
    dry: Shader,
    wet: Shader,
    t: number,
    ctx: FillRendererContext,
): Shader | null {
    const rte = getOrCompileSkSL(MIX_SKSL, ctx.canvasKit);
    if (!rte) return null;
    return rte.makeShaderWithChildren([t], [dry, wet]);
}

const MIX_SKSL = `
uniform shader u_dry;
uniform shader u_wet;
uniform float u_t;

vec4 main(vec2 p) {
    return mix(u_dry.eval(p), u_wet.eval(p), u_t);
}
`;

/**
 * `composed` at `t` of its full strength, over the ungraded source.
 *
 * The colour matrix scales **alpha alone**, and Skia's matrix colour filter runs
 * on unpremultiplied colour — so re-premultiplying gives `wet · t`, which is
 * precisely the source-over weight a lerp wants. `MakeBlend`'s null background
 * is the ungraded input, so the pair composites to `wet·t + dry·(1 − t·wetAlpha)`
 * — an exact lerp wherever the fill is opaque, which inside a picture is
 * everywhere. The antialiased rim reads a shade less graded, and that is the
 * price of the ImageFilter path having no interpolating blend; the lens path
 * above pays nothing because it can use a shader.
 */
function fadeImageFilter(
    composed: import("@motion-script/canvaskit").ImageFilter,
    t: number,
    ctx: FillRendererContext,
): import("@motion-script/canvaskit").ImageFilter {
    const ck = ctx.canvasKit;
    const alpha = ck.ColorFilter.MakeMatrix([
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, t, 0,
    ]);
    const faded = ck.ImageFilter.MakeColorFilter(alpha, composed);
    alpha.delete();
    const blended = ck.ImageFilter.MakeBlend(ck.BlendMode.SrcOver, null, faded);
    faded.delete();
    return blended;
}

/** The placement fields `computeImageMatrix` reads off an image or video fill. */
export interface MediaPlacement {
    fit?: string;
    crop?: { left: number; right: number; top: number; bottom: number };
    zoom?: number;
    anchor?: { x: number; y: number };
    matrix?: Float32Array | number[][];
}

/**
 * Compute the image→shape matrix (3×3 as a 9-tuple, row-major) for a fill
 * descriptor and the destination bounds. This is exactly the matrix handed to
 * the image shader, so contour paths transformed by it land on the visible
 * image's pixel positions.
 *
 * Four independent stages, in order — which is what lets them compose:
 *
 *   1. **crop**   picks a window of the source; everything after treats that
 *                 window as if it were the whole image.
 *   2. **fit**    resolves the base scale for the window (cover/contain/tile/stretch).
 *   3. **zoom**   multiplies that scale.
 *   4. **anchor** decides which point of the source lands on the same point of
 *                 the box, which is both the zoom focal point and the alignment
 *                 when the image doesn't cover.
 *
 * At the defaults (`zoom: 1`, `anchor` centre, no crop) every branch reduces to
 * the plain centred cover/contain placement.
 */
export function computeImageMatrix(
    imgW: number,
    imgH: number,
    fill: MediaPlacement,
    bounds: ShapeBounds | null,
): number[] {
    // The raw matrix wins outright: the author is placing the pixels themselves.
    if (fill.matrix) {
        if (fill.matrix instanceof Float32Array) return Array.from(fill.matrix);
        return (fill.matrix as number[][]).flat();
    }

    const zoom = fill.zoom ?? 1;
    if (!bounds) return [zoom, 0, 0, 0, zoom, 0, 0, 0, 1];

    const mode = fill.fit ?? "fill";
    const boxW = bounds.right - bounds.left;
    const boxH = bounds.bottom - bounds.top;

    // 1. crop — the source window, in image px. Skipped for 'tile': TileMode.Repeat
    //    repeats the whole texture, so a sub-rect cannot be tiled.
    const crop = mode === "tile" ? undefined : fill.crop;
    const srcX = crop ? crop.left * imgW : 0;
    const srcY = crop ? crop.top * imgH : 0;
    const srcW = crop ? imgW * (1 - crop.left - crop.right) : imgW;
    const srcH = crop ? imgH * (1 - crop.top - crop.bottom) : imgH;
    // A crop that swallows the whole source would divide by zero below.
    if (srcW <= 0 || srcH <= 0) return [zoom, 0, bounds.left, 0, zoom, bounds.top, 0, 0, 1];

    // 2. fit — the base scale, measured against the cropped window.
    let sx: number, sy: number;
    if (mode === "fit") {
        // Contain: scale uniformly so the whole window fits, letterboxing.
        sx = sy = Math.min(boxW / srcW, boxH / srcH);
    } else if (mode === "stretch") {
        // Distort each axis independently to fill the bounds exactly.
        sx = boxW / srcW; sy = boxH / srcH;
    } else if (mode === "tile") {
        sx = sy = 1; // native size; `zoom` below is the tile-size multiplier
    } else {
        // "fill" (default): cover — scale uniformly to fill the bounds, cropping
        // the overflow (Figma-style).
        sx = sy = Math.max(boxW / srcW, boxH / srcH);
    }

    // 3. zoom — a multiplier on whatever the fit resolved.
    sx *= zoom; sy *= zoom;

    // A repeating texture has no corner to pin, so tile keeps its origin.
    if (mode === "tile") return [sx, 0, bounds.left, 0, sy, bounds.top, 0, 0, 1];

    // 4. anchor — the source's normalised point lands on the box's same point.
    //    Convert [-1,1] y-up (the pivot/align space) to [0,1] y-down (texture space).
    const anchor = fill.anchor ?? { x: 0, y: 0 };
    const ax = (anchor.x + 1) / 2;
    const ay = (1 - anchor.y) / 2;
    const tx = bounds.left + ax * (boxW - srcW * sx) - srcX * sx;
    const ty = bounds.top + ay * (boxH - srcH * sy) - srcY * sy;
    return [sx, 0, tx, 0, sy, ty, 0, 0, 1];
}

/**
 * Shared image-shader builder used by both image and video renderers.
 *
 * `filterMode` overrides the default bilinear sampling — see {@link samplingFor}
 * for why a filter chain gets to choose it.
 */
export function makeImageShader(
    img: CKImage,
    fill: MediaPlacement,
    ck: any,
    bounds: ShapeBounds | null,
    filterMode: "linear" | "nearest" = "linear",
): any {
    const mode = fill.fit ?? "fill";
    // 'tile' repeats. Anything that may leave a gap must keep it transparent
    // (Decal) rather than smearing edge pixels: 'fit' letterboxes by definition,
    // and *any* mode pulled below its fitted scale by `zoom < 1` no longer covers
    // the box. Where the image does cover, Clamp avoids the half-texel
    // transparent hairline bilinear sampling would leave at the edges.
    const covers = mode !== "fit" && (fill.zoom ?? 1) >= 1;
    const tileMode = mode === "tile"
        ? ck.TileMode.Repeat
        : covers
            ? ck.TileMode.Clamp
            : ck.TileMode.Decal;

    const matrix = computeImageMatrix(img.width(), img.height(), fill, bounds);

    return img.makeShaderOptions(
        tileMode,
        tileMode,
        filterMode === "nearest" ? ck.FilterMode.Nearest : ck.FilterMode.Linear,
        ck.MipmapMode.None,
        matrix,
    );
}
