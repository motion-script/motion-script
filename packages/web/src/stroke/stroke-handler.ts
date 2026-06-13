import type {
    CanvasKit,
    Canvas,
    Paint,
    Path as CKPath,
} from "@motion-script/canvaskit";
import type {
    FillResolved,
    ShadowResolved,
    StrokeResolved,
} from "@motion-script/core";
import { FillRenderRegistry } from "../fills/registry";
import type { FillHandler } from "../fills/handler";

/**
 * Paints strokes and shadows over shape silhouettes. Handles the gritty parts
 * of vector stroking on Skia: sub-pixel-width strokes are rasterized as filled
 * paths for uniform AA (see {@link drawStroke}), thin strokes get pixel-grid
 * snapped (see {@link snapPath}), dashes are length-fit per contour, and text
 * gets a synthesized union outline since glyph paths aren't directly available
 * (see {@link drawTextUnionStroke}). Delegates shader/paint setup for fills to
 * {@link FillHandler}.
 */
export class StrokeHandler {
    private canvasKit: CanvasKit;
    private getCanvas: () => Canvas;
    private getPaint: () => Paint;
    private fills: FillHandler;
    constructor(
        canvasKit: CanvasKit,
        getCanvas: () => Canvas,
        getPaint: () => Paint,
        fills: FillHandler,
    ) {
        this.canvasKit = canvasKit;
        this.getCanvas = getCanvas;
        this.getPaint = getPaint;
        this.fills = fills;
    }

    makeUniformDashEffect(
        path: CKPath,
        dash: number[],
        dashOffset: number = 0,
        fit?: { scaledDash: number[]; scale: number },
    ): any | null {
        const info = fit ?? this.measureDashFit(path, dash);
        if (!info) return null;
        return this.canvasKit.PathEffect.MakeDash(info.scaledDash, dashOffset * info.scale);
    }

    // Compute a per-contour-uniform dash pattern by scaling the dash array so an
    // integer number of cycles fits the path length exactly.
    private measureDashFit(
        path: CKPath,
        dash: number[],
    ): { scaledDash: number[]; scale: number } | null {
        const cycleLength = dash.reduce((a, b) => a + b, 0);
        if (cycleLength <= 0) return null;

        let totalLength = 0;
        const iter = new this.canvasKit.ContourMeasureIter(path, false, 1);
        let contour = iter.next();
        while (contour) {
            totalLength += contour.length();
            contour.delete();
            contour = iter.next();
        }
        iter.delete();

        if (totalLength <= 0) return null;

        const cycles = Math.max(1, Math.round(totalLength / cycleLength));
        const scale = totalLength / (cycles * cycleLength);
        return { scaledDash: dash.map(d => d * scale), scale };
    }

    // Build a path consisting of just the "on" dash segments along the original
    // path. Used so we can run makeStroked() on a dashed path and draw the
    // result as a fill (gives uniform AA on all sides). The caller owns the
    // returned path and must delete() it.
    private buildDashedPath(
        path: CKPath,
        dash: number[],
        dashOffset: number,
        fit?: { scaledDash: number[]; scale: number },
    ): CKPath | null {
        const resolvedFit = fit ?? this.measureDashFit(path, dash);
        if (!resolvedFit) return null;
        const { scaledDash, scale } = resolvedFit;
        const cycle = scaledDash.reduce((a, b) => a + b, 0);
        if (cycle <= 0) return null;
        const startOffset = ((dashOffset * scale) % cycle + cycle) % cycle;

        const builder = new this.canvasKit.PathBuilder();
        const iter = new this.canvasKit.ContourMeasureIter(path, false, 1);
        let contour = iter.next();
        let appended = false;

        while (contour) {
            const length = contour.length();

            // Locate the dash segment that contains startOffset.
            let dashIndex = 0;
            let segStart = 0;
            while (segStart + scaledDash[dashIndex] <= startOffset && dashIndex < scaledDash.length) {
                segStart += scaledDash[dashIndex];
                dashIndex = (dashIndex + 1) % scaledDash.length;
                if (dashIndex === 0) break;
            }
            let dashRemaining = scaledDash[dashIndex] - (startOffset - segStart);
            let drawing = dashIndex % 2 === 0;

            let t = 0;
            while (t < length - 1e-6) {
                const segLen = Math.min(dashRemaining, length - t);
                if (drawing && segLen > 1e-3) {
                    const seg = contour.getSegment(t, t + segLen, true);
                    if (seg) {
                        builder.addPath(seg);
                        seg.delete();
                        appended = true;
                    }
                }
                t += segLen;
                dashRemaining -= segLen;
                if (dashRemaining <= 1e-6) {
                    dashIndex = (dashIndex + 1) % scaledDash.length;
                    dashRemaining = scaledDash[dashIndex];
                    drawing = !drawing;
                }
            }

            contour.delete();
            contour = iter.next();
        }
        iter.delete();

        if (!appended) {
            builder.delete();
            return null;
        }
        return builder.detachAndDelete();
    }

    private deviceMetrics(canvas: Canvas): { sx: number; sy: number; tx: number; ty: number } {
        const m = canvas.getTotalMatrix();
        return {
            sx: Math.hypot(m[0], m[3]),
            sy: Math.hypot(m[1], m[4]),
            tx: m[2],
            ty: m[5],
        };
    }

    // For thin strokes (≤ ~2.5 device px), round to an integer device width
    // ≥ 1 px and convert back to logical units. Returns the adjusted logical
    // weight and the integer device width (or -1 when no snapping should occur).
    private resolveStrokeWidth(
        weight: number,
        deviceScale: number,
    ): { logical: number; intDeviceWidth: number } {
        if (weight <= 0 || deviceScale <= 0) {
            return { logical: 0, intDeviceWidth: -1 };
        }
        const deviceWidth = weight * deviceScale;
        if (deviceWidth >= 2.5) {
            return { logical: weight, intDeviceWidth: -1 };
        }
        const intDeviceWidth = Math.max(1, Math.round(deviceWidth));
        return { logical: intDeviceWidth / deviceScale, intDeviceWidth };
    }

    // Snap the canvas so the path's bounds land exactly on the device pixel
    // grid — half-pixel offsets for odd stroke widths, integer for even — on
    // ALL four sides. When the path's device-space size isn't already an
    // integer we apply a sub-pixel scale around the top-left corner so right
    // and bottom also align. Bails on rotated/skewed matrices since "pixel
    // grid" isn't well defined there. Returns true if canvas.save() was called.
    private snapPath(
        canvas: Canvas,
        intDeviceWidth: number,
        ckPath: CKPath | undefined,
    ): boolean {
        if (intDeviceWidth <= 0 || !ckPath) return false;
        const m = canvas.getTotalMatrix();
        if (Math.abs(m[1]) > 1e-6 || Math.abs(m[3]) > 1e-6) return false;
        const sx = m[0], sy = m[4], tx = m[2], ty = m[5];
        if (sx === 0 || sy === 0) return false;

        const b = ckPath.getBounds();
        const wLog = b[2] - b[0];
        const hLog = b[3] - b[1];
        if (wLog <= 0 || hLog <= 0) return false;

        const leftDev = tx + sx * b[0];
        const topDev = ty + sy * b[1];
        const rightDev = tx + sx * b[2];
        const bottomDev = ty + sy * b[3];

        const offset = intDeviceWidth % 2 === 0 ? 0 : 0.5;
        const targetLeft = Math.round(leftDev - offset) + offset;
        const targetTop = Math.round(topDev - offset) + offset;
        const targetRight = Math.round(rightDev - offset) + offset;
        const targetBottom = Math.round(bottomDev - offset) + offset;

        // Refuse to snap if rounding would collapse the path.
        if (targetRight - targetLeft < 1) return false;
        if (targetBottom - targetTop < 1) return false;

        const scaleX = (targetRight - targetLeft) / (rightDev - leftDev);
        const scaleY = (targetBottom - targetTop) / (bottomDev - topDev);

        // Skip when the path is already aligned.
        if (
            Math.abs(scaleX - 1) < 1e-4
            && Math.abs(scaleY - 1) < 1e-4
            && Math.abs(targetLeft - leftDev) < 1e-4
            && Math.abs(targetTop - topDev) < 1e-4
        ) return false;

        // Concat L such that current * L maps the path bounds to the targets.
        // L is axis-aligned scale+translate in path-local space:
        //   L = [scaleX 0 c; 0 scaleY d; 0 0 1]
        // where (scaleX, scaleY) makes device width/height integer and (c, d)
        // shifts the top-left corner to (targetLeft, targetTop).
        const c = (targetLeft - tx) / sx - scaleX * b[0];
        const d = (targetTop - ty) / sy - scaleY * b[1];

        canvas.save();
        canvas.concat([scaleX, 0, c, 0, scaleY, d, 0, 0, 1]);
        return true;
    }

    // `resolveBounds`, when supplied, returns the bounds a stroke's fill shader
    // should resolve against for a given shape (driven by the fill's `space`).
    // The shader is rebuilt per shape so each can resolve against its own rect;
    // when omitted, bounds come from whatever the fill handler last set.
    /** Paints each resolved stroke over every shape: resolves device-px stroke width (with thin-stroke snapping), builds the fill shader per shape via the registry, then draws through {@link drawStroke}. Each fill layer in `stroke.fill` is drawn as its own pass, bottom-to-top. */
    applyStrokes(
        strokes: StrokeResolved[],
        shapes: Array<{ draw: (p: Paint) => void; ckPath?: CKPath }>,
        resolveBounds?: (
            fill: FillResolved,
            shape: { ckPath?: CKPath },
        ) => void,
    ): boolean {
        if (strokes.length === 0) return false;

        const canvas = this.getCanvas();
        const paint = this.getPaint();
        paint.setStyle(this.canvasKit.PaintStyle.Stroke);

        const rendererCtx = this.fills.buildRendererCtx(paint);

        const worldAlpha = this.fills.worldAlpha();
        for (const stroke of strokes) {
            const weight = stroke.weight ?? 1;
            const { sx, sy } = this.deviceMetrics(canvas);
            const { logical, intDeviceWidth } = this.resolveStrokeWidth(weight, Math.max(sx, sy));
            paint.setStrokeWidth(logical);

            for (const fill of stroke.fill) {
                const opacity = (fill.opacity !== undefined ? fill.opacity : 1.0) * worldAlpha;
                paint.setAlphaf(opacity);

                if (fill.blend) {
                    paint.setBlendMode(this.fills.getCanvasKitBlendMode(fill.blend));
                } else {
                    paint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
                }

                for (const shape of shapes) {
                    if (resolveBounds) resolveBounds(fill, shape);
                    if (!FillRenderRegistry.applyPaint(fill, rendererCtx)) continue;
                    const snapped = this.snapPath(canvas, intDeviceWidth, shape.ckPath);
                    this.drawStroke(canvas, paint, shape, stroke, logical, intDeviceWidth);
                    if (snapped) canvas.restore();
                }
            }
        }

        paint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
        paint.setAlphaf(1.0);
        paint.setShader(null);
        paint.setStyle(this.canvasKit.PaintStyle.Stroke);
        return true;
    }

    // Draw one stroke pass on one shape. For thin strokes (intDeviceWidth > 0)
    // we convert the stroke to a filled path via Path.makeStroked() and draw it
    // as a fill — fill rasterization gives uniform AA on every side, which the
    // stroke rasterizer doesn't for sub-pixel widths. Dashed thin strokes get
    // their dash pattern baked into a path first (buildDashedPath) so the same
    // makeStroked trick works on them.
    //
    // Stroke alignment (`stroke.align`, -1 inside … 0 center … +1 outside) is
    // realized by stroking a filled band and clipping it to the shape's
    // interior: an aligned stroke is ALWAYS drawn as a filled path (never as a
    // centered Skia stroke), so the snap/center fast paths below only apply when
    // align is 0. See alignedStrokeBand().
    private drawStroke(
        canvas: Canvas,
        paint: Paint,
        shape: { draw: (p: Paint) => void; ckPath?: CKPath; isText?: boolean },
        stroke: StrokeResolved,
        logicalWidth: number,
        intDeviceWidth: number,
    ): void {
        if (shape.isText) {
            this.drawTextUnionStroke(canvas, paint, shape, stroke, logicalWidth);
            return;
        }

        const hasDash = !!(stroke.dash && stroke.dash.length > 0);
        // Measure dash fit once; pass to both buildDashedPath and makeUniformDashEffect
        // so the contour iteration runs only once per dashed shape.
        const dashFit = hasDash && shape.ckPath
            ? this.measureDashFit(shape.ckPath, stroke.dash!)
            : null;

        const align = stroke.align ?? 0;

        if (intDeviceWidth > 0 && shape.ckPath) {
            const source = hasDash
                ? this.buildDashedPath(shape.ckPath, stroke.dash!, stroke.dashOffset ?? 0, dashFit ?? undefined)
                : shape.ckPath;
            if (source) {
                const filled = this.alignedStrokeBand(source, logicalWidth, align, shape.ckPath);
                if (source !== shape.ckPath) source.delete();
                if (filled) {
                    paint.setStyle(this.canvasKit.PaintStyle.Fill);
                    canvas.drawPath(filled, paint);
                    paint.setStyle(this.canvasKit.PaintStyle.Stroke);
                    filled.delete();
                    return;
                }
            }
        }

        // Thick, non-dashed strokes with alignment: build the filled band and
        // draw it as a fill (the centered Skia stroke can't be aligned).
        if (align !== 0 && !hasDash && shape.ckPath) {
            const band = this.alignedStrokeBand(shape.ckPath, logicalWidth, align, shape.ckPath);
            if (band) {
                paint.setStyle(this.canvasKit.PaintStyle.Fill);
                canvas.drawPath(band, paint);
                paint.setStyle(this.canvasKit.PaintStyle.Stroke);
                band.delete();
                return;
            }
        }

        // Fallback for thick strokes or when makeStroked/dashing failed.
        if (hasDash && shape.ckPath) {
            const effect = this.makeUniformDashEffect(shape.ckPath, stroke.dash!, stroke.dashOffset ?? 0, dashFit ?? undefined);
            if (effect) {
                paint.setPathEffect(effect);
                // An aligned dashed stroke shifts off-center by clipping the
                // centered dashed stroke against the (doubled) shape interior.
                // Only for closed shapes — open contours have no inside/outside.
                if (align !== 0 && intDeviceWidth <= 0 && this.isClosedPath(shape.ckPath)) {
                    this.drawAlignedDashedStroke(canvas, paint, shape.ckPath, align);
                } else {
                    canvas.drawPath(shape.ckPath, paint);
                }
                paint.setPathEffect(null);
                effect.delete();
                return;
            }
        }
        shape.draw(paint);
    }

    // Build a filled stroke band placed by `align` (-1 inside, 0 center,
    // +1 outside). Centered strokes (align 0) just fill the centered outline.
    // Otherwise we widen the band to w·(1+|align|) so that clipping it to the
    // shape interior (inside) or its complement (outside) leaves a band that is
    // full-width at the endpoints and slides continuously through center. The
    // caller owns the returned path and must delete() it; returns null on failure.
    //
    // Alignment only has meaning for a closed region — an open contour (a Line,
    // or any shape trimmed by start/end) has no inside/outside, so we ignore
    // `align` and fall back to the centered band rather than clipping against a
    // degenerate interior (which would blank the stroke).
    private alignedStrokeBand(
        source: CKPath,
        width: number,
        align: number,
        interior: CKPath,
    ): CKPath | null {
        if (align === 0 || !this.isClosedPath(interior)) {
            return source.makeStroked({ width });
        }
        const widened = width * (1 + Math.abs(align));
        const band = source.makeStroked({ width: widened });
        if (!band) return null;
        // align < 0 → keep the part inside the shape; align > 0 → outside.
        // Use the static Path.MakeFromOp (this CanvasKit build has no instance
        // makeCombined). MakeFromOp doesn't consume its inputs, so the caller's
        // `interior` survives and we delete the transient band ourselves.
        const op = align < 0
            ? this.canvasKit.PathOp.Intersect
            : this.canvasKit.PathOp.Difference;
        const clipped = this.canvasKit.Path.MakeFromOp(band, interior, op);
        band.delete();
        return clipped;
    }

    // True only when every contour of `path` is closed, so it bounds a region
    // that inside/outside alignment can clip against. Open contours (lines,
    // trimmed shapes) return false. An empty path returns false.
    private isClosedPath(path: CKPath): boolean {
        const iter = new this.canvasKit.ContourMeasureIter(path, false, 1);
        let contour = iter.next();
        if (!contour) {
            iter.delete();
            return false;
        }
        let allClosed = true;
        while (contour) {
            if (!contour.isClosed()) allClosed = false;
            contour.delete();
            contour = iter.next();
        }
        iter.delete();
        return allClosed;
    }

    // Aligned dashed stroke when the makeStroked fast path didn't apply (thick
    // dashed stroke): draw the centered, dashed stroke at double width and clip
    // it to the shape interior (inside) or its complement (outside). Doubling
    // before the clip means the surviving band is the full requested width on
    // the kept side rather than the half-width a centered stroke would leave.
    // `paint` already carries the dash PathEffect and stroke style.
    private drawAlignedDashedStroke(
        canvas: Canvas,
        paint: Paint,
        interior: CKPath,
        align: number,
    ): void {
        canvas.save();
        const baseWidth = paint.getStrokeWidth();
        paint.setStrokeWidth(baseWidth * 2);
        const op = align < 0
            ? this.canvasKit.ClipOp.Intersect
            : this.canvasKit.ClipOp.Difference;
        canvas.clipPath(interior, op, true);
        canvas.drawPath(interior, paint);
        canvas.restore();
        paint.setStrokeWidth(baseWidth);
    }

    // Strokes that follow the union of all glyph silhouettes, like Figma. We
    // can't get glyph paths out of canvaskit-wasm to compute a real union, so
    // we stroke each glyph at 2× width inside a saveLayer and then erase the
    // interior (DstOut against the fill silhouette). What's left is an
    // outside-aligned stroke of the requested width on the outer boundary of
    // the union — internal crossings at overlapping glyphs disappear because
    // they sit inside the silhouette and get erased.
    //
    // Dashed text strokes piggy-back on Skia's drawText → glyph-path fallback:
    // setting PathEffect.MakeDash on the paint causes the stroke rasterizer to
    // dash along each glyph's outline. We can't size the dash to the contour
    // (no path to measure), so the dash array is used as-is.
    private drawTextUnionStroke(
        canvas: Canvas,
        paint: Paint,
        shape: { draw: (p: Paint) => void },
        stroke: StrokeResolved,
        logicalWidth: number,
    ): void {
        const hasDash = !!(stroke.dash && stroke.dash.length > 0);
        let dashEffect: any = null;
        if (hasDash) {
            dashEffect = this.canvasKit.PathEffect.MakeDash(stroke.dash!, stroke.dashOffset ?? 0);
            paint.setPathEffect(dashEffect);
        }

        canvas.saveLayer();

        paint.setStrokeWidth(logicalWidth * 2);
        shape.draw(paint);

        const eraser = new this.canvasKit.Paint();
        eraser.setStyle(this.canvasKit.PaintStyle.Fill);
        eraser.setBlendMode(this.canvasKit.BlendMode.DstOut);
        eraser.setColor(this.canvasKit.WHITE);
        shape.draw(eraser);
        eraser.delete();

        canvas.restore();
        paint.setStrokeWidth(logicalWidth);

        if (dashEffect) {
            paint.setPathEffect(null);
            dashEffect.delete();
        }
    }

    /**
     * Paints *outer* (drop) shadows: offsets/blurs a silhouette layer beneath the
     * real paint. Inner shadows are skipped here — they must composite over the
     * fill, so the caller paints them afterwards via {@link applyInnerShadows}.
     */
    applyShadows(
        shadows: ShadowResolved[],
        shapes: Array<{ draw: (p: Paint) => void; ckPath?: CKPath; spreadPath?: (spread: number) => CKPath | null }>,
        fills: FillResolved[],
        strokes: StrokeResolved[],
        resolveBounds?: (
            fill: FillResolved,
            shape: { ckPath?: CKPath } | null,
        ) => void,
    ): void {
        if (shadows.length === 0) return;

        const paint = this.getPaint();

        const hasFill = fills.length > 0 && fills.some(f => (f.opacity ?? 1) > 0);
        const hasStrokes = strokes.length > 0;
        const worldAlpha = this.fills.worldAlpha();

        for (const shadow of shadows) {
            if (shadow.inner) continue; // drawn after the fill — see applyInnerShadows
            this.applyDropShadow(shadow, shapes, hasFill, hasStrokes, strokes, worldAlpha, resolveBounds);
        }

        paint.setStyle(this.canvasKit.PaintStyle.Fill);
        paint.setPathEffect(null);
        paint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
        paint.setAlphaf(1.0);
        paint.setShader(null);
    }

    /**
     * Paints *inner* (inset) shadows, which must run after the fill so they sit
     * on top of it rather than being hidden beneath. Outer shadows are ignored
     * here. Call once the shape's fill has been drawn.
     */
    applyInnerShadows(
        shadows: ShadowResolved[],
        shapes: Array<{ draw: (p: Paint) => void; ckPath?: CKPath; spreadPath?: (spread: number) => CKPath | null }>,
        fills: FillResolved[],
        resolveBounds?: (
            fill: FillResolved,
            shape: { ckPath?: CKPath } | null,
        ) => void,
    ): void {
        if (shadows.length === 0) return;

        const paint = this.getPaint();
        const hasFill = fills.length > 0 && fills.some(f => (f.opacity ?? 1) > 0);
        const worldAlpha = this.fills.worldAlpha();

        for (const shadow of shadows) {
            if (!shadow.inner) continue;
            this.applyInnerShadow(shadow, shapes, hasFill, worldAlpha, resolveBounds);
        }

        paint.setStyle(this.canvasKit.PaintStyle.Fill);
        paint.setPathEffect(null);
        paint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
        paint.setAlphaf(1.0);
        paint.setShader(null);
    }

    /** Outer drop shadow: for each fill layer, offsets and optionally blurs a silhouette layer (filled shapes and/or strokes recolored to that fill layer), composited beneath the real paint via `saveLayer`. */
    private applyDropShadow(
        shadow: ShadowResolved,
        shapes: Array<{ draw: (p: Paint) => void; ckPath?: CKPath; spreadPath?: (spread: number) => CKPath | null }>,
        hasFill: boolean,
        hasStrokes: boolean,
        strokes: StrokeResolved[],
        worldAlpha: number,
        resolveBounds?: (fill: FillResolved, shape: { ckPath?: CKPath } | null) => void,
    ): void {
        const canvas = this.getCanvas();
        const paint = this.getPaint();
        const dx = shadow.dx ?? 0;
        const dy = shadow.dy ?? 0;

        // A non-zero spread grows/shrinks the filled silhouette before blur, but
        // only for shapes that can resize their geometry cleanly (ellipse, rect);
        // every other shape ignores it. Spread applies to the box, not strokes, so
        // only build them when there's a fill to recolour. Built once and reused
        // across fill layers. A null entry means "this shape has no spread path"
        // (unsupported kind, or the shrink collapsed it) — fall back to the real
        // silhouette so the shadow still casts.
        const spreadPaths = shadow.spread !== 0 && hasFill
            ? shapes.map(s => s.spreadPath?.(shadow.spread) ?? null)
            : null;

        for (const fill of shadow.fill) {
            const opacity = (fill.opacity !== undefined ? fill.opacity : 1.0) * worldAlpha;

            const layerPaint = new this.canvasKit.Paint();
            layerPaint.setAlphaf(opacity);
            if (shadow.blur > 0) {
                const sigma = shadow.blur / 2;
                const filter = this.canvasKit.ImageFilter.MakeBlur(
                    sigma, sigma, this.canvasKit.TileMode.Decal, null,
                );
                layerPaint.setImageFilter(filter);
            }

            canvas.save();
            // Scene coords are Y-up; the canvas is Y-down, so negate dy to keep
            // a positive dy nudging the shadow upward.
            canvas.translate(dx, -dy);
            canvas.saveLayer(layerPaint);

            paint.setAlphaf(1.0);
            if (resolveBounds) resolveBounds(fill, null);
            // worldAlpha is already realised by the alpha'd saveLayer above;
            // pass 1 so a solid silhouette colour isn't dimmed by it twice.
            FillRenderRegistry.applyPaint(fill, this.fills.buildRendererCtx(paint, 1));

            if (hasFill) {
                paint.setStyle(this.canvasKit.PaintStyle.Fill);
                paint.setPathEffect(null);
                for (let i = 0; i < shapes.length; i++) {
                    const spreadPath = spreadPaths?.[i];
                    if (spreadPath) canvas.drawPath(spreadPath, paint);
                    else shapes[i].draw(paint);
                }
            }

            if (hasStrokes) {
                paint.setStyle(this.canvasKit.PaintStyle.Stroke);
                for (const stroke of strokes) {
                    const weight = stroke.weight ?? 1;
                    const { sx, sy } = this.deviceMetrics(canvas);
                    const { logical, intDeviceWidth } = this.resolveStrokeWidth(weight, Math.max(sx, sy));
                    paint.setStrokeWidth(logical);
                    paint.setPathEffect(null);
                    // Shadow strokes inherit the shadow's silhouette colour set
                    // above — they are not painted with the real stroke fill.
                    for (const shape of shapes) {
                        const snapped = this.snapPath(canvas, intDeviceWidth, shape.ckPath);
                        this.drawStroke(canvas, paint, shape, stroke, logical, intDeviceWidth);
                        if (snapped) canvas.restore();
                    }
                }
            }

            canvas.restore();
            canvas.restore();
            layerPaint.delete();
        }

        if (spreadPaths) for (const p of spreadPaths) p?.delete();
    }

    /**
     * Inner (inset) shadow: clip to the shape silhouette, then fill the region
     * *outside* an offset copy of the contour. We build that region explicitly as
     * (bounding rect − offset shape), since this CanvasKit build exposes no
     * inverse fill type. Blurred and clipped back to the shape, it bleeds inward
     * along the edges opposite the offset — the look of light cast into a recess.
     * Needs each shape's `ckPath`; shapes without one (text) are skipped. Strokes
     * aren't applicable to an inset shadow.
     */
    private applyInnerShadow(
        shadow: ShadowResolved,
        shapes: Array<{ draw: (p: Paint) => void; ckPath?: CKPath; spreadPath?: (spread: number) => CKPath | null }>,
        hasFill: boolean,
        worldAlpha: number,
        resolveBounds?: (fill: FillResolved, shape: { ckPath?: CKPath } | null) => void,
    ): void {
        if (!hasFill) return;

        const canvas = this.getCanvas();
        const paint = this.getPaint();
        const dx = shadow.dx ?? 0;
        // Scene coords are Y-up; the canvas is Y-down, so negate dy to keep a
        // positive dy casting the inset shadow from the top edge downward.
        const dy = -(shadow.dy ?? 0);

        for (const shape of shapes) {
            if (!shape.ckPath) continue;

            // Spread is the inverse for an inset shadow: a positive spread makes
            // the shadow intrude further, which means shrinking the contour it is
            // cast from — so we ask for spreadPath(-spread). The clip still uses
            // the real silhouette below, so only the visible recess is painted.
            const supportsSpread = shadow.spread !== 0 && !!shape.spreadPath;
            const spreadContour = supportsSpread
                ? shape.spreadPath!(-shadow.spread)
                : null;

            // A positive spread that exceeds the shape's half-size collapses the
            // contour to nothing (spreadPath returns null on a supported shape):
            // the inset shadow then fills the whole interior, so there's no contour
            // to subtract — pass null and the region becomes the full padded rect.
            // For unsupported shapes we cast from the real silhouette (no spread).
            const contour = spreadContour
                ?? (supportsSpread ? null : shape.ckPath);

            // The blur reaches `blur` px past the contour, and the offset shifts
            // it further; pad the bounding rect so its own edges never cast a
            // shadow into the shape. The enclosing rect is sized from the *real*
            // silhouette (shape.ckPath), not the spread contour — a large positive
            // spread shrinks the contour well inside the shape, so a rect sized to
            // the contour would fall short of the real edges and leave an unpainted
            // band there.
            const region = this.buildInnerShadowRegion(contour, shape.ckPath, dx, dy, shadow.blur);
            if (!region) { spreadContour?.delete(); continue; }

            for (const fill of shadow.fill) {
                const opacity = (fill.opacity !== undefined ? fill.opacity : 1.0) * worldAlpha;

                const layerPaint = new this.canvasKit.Paint();
                layerPaint.setAlphaf(opacity);
                if (shadow.blur > 0) {
                    const sigma = shadow.blur / 2;
                    const filter = this.canvasKit.ImageFilter.MakeBlur(
                        sigma, sigma, this.canvasKit.TileMode.Decal, null,
                    );
                    layerPaint.setImageFilter(filter);
                }

                canvas.save();
                // Confine the painting to the shape so only the part of the region
                // that intrudes past the contour shows as an inset shadow.
                canvas.clipPath(shape.ckPath, this.canvasKit.ClipOp.Intersect, true);
                canvas.saveLayer(layerPaint);

                paint.setAlphaf(1.0);
                if (resolveBounds) resolveBounds(fill, null);
                // worldAlpha is realised by the alpha'd saveLayer above; pass 1
                // so a solid silhouette colour isn't dimmed by it twice.
                FillRenderRegistry.applyPaint(fill, this.fills.buildRendererCtx(paint, 1));

                paint.setStyle(this.canvasKit.PaintStyle.Fill);
                paint.setPathEffect(null);
                canvas.drawPath(region, paint);

                canvas.restore();
                canvas.restore();
                layerPaint.delete();
            }

            region.delete();
            spreadContour?.delete();
        }
    }

    /**
     * The fillable region for an inset shadow: a padded bounding rect with an
     * offset copy of `contour` subtracted, so filling it covers everything
     * *outside* the shifted contour. The enclosing rect is sized from `silhouette`
     * — the real shape the result is clipped to — rather than `contour`, so a
     * spread-shrunk contour can't pull the rect inside the shape and leave an
     * unpainted band at the edges. A null `contour` (a positive spread that
     * collapsed the contour to nothing) subtracts nothing, so the region is the
     * whole padded rect and the shadow fills the entire interior. Caller owns the
     * result and must delete() it; returns null if the boolean op fails.
     */
    private buildInnerShadowRegion(contour: CKPath | null, silhouette: CKPath, dx: number, dy: number, blur: number): CKPath | null {
        // Bounding rect padded past the blur + offset reach, measured from the
        // real silhouette so the rect always fully encloses the shape no matter
        // how far a positive spread shrank the contour.
        const b = silhouette.getBounds();
        const pad = blur * 2 + Math.abs(dx) + Math.abs(dy) + 1;
        const rectBuilder = new this.canvasKit.PathBuilder();
        rectBuilder.addRect([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]);
        const rect = rectBuilder.detachAndDelete();

        // No contour to subtract — the whole padded rect is the region (clipped to
        // the shape later, this fills the entire interior).
        if (!contour) return rect;

        // Offset copy of the contour (PathBuilder, since Path is immutable here).
        const offsetBuilder = new this.canvasKit.PathBuilder(contour);
        offsetBuilder.offset(dx, dy);
        const offset = offsetBuilder.detachAndDelete();

        // rect − offsetShape = the area outside the shifted contour, as a normal
        // (non-inverse) fillable path. MakeFromOp doesn't consume its inputs.
        const region = this.canvasKit.Path.MakeFromOp(rect, offset, this.canvasKit.PathOp.Difference);
        rect.delete();
        offset.delete();
        return region;
    }
}
