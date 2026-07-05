import type { CanvasKit, Canvas, Paint, TypefaceFontProvider } from "@motion-script/canvaskit";
import { TextState, withTextDescriptor, resolveShapePivot } from "@motion-script/core";
import type { CurrentShape } from "./shape-handler";
import { layoutParagraph, drawShapedRunAt, type ParagraphSegment } from "./paragraph-layout";
import { layoutTextOnPath, drawTextOnPath } from "./text-path";
import { ParagraphShapeCache, shapeKey, shapeKeyInputsFor } from "./paragraph-cache";

type Bounds = { left: number; top: number; right: number; bottom: number };

/** The enclosing axis-aligned box of `bounds`' four corners after rotating (degrees,
 *  clockwise, canvas convention) and uniformly scaling about `(px, py)`. */
function rotatedBounds(bounds: Bounds, px: number, py: number, rotationDeg: number, scale: number): Bounds {
    const rad = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const corners = [
        { x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top },
        { x: bounds.right, y: bounds.bottom }, { x: bounds.left, y: bounds.bottom },
    ];
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const c of corners) {
        const ox = (c.x - px) * scale;
        const oy = (c.y - py) * scale;
        const x = px + ox * cos - oy * sin;
        const y = py + ox * sin + oy * cos;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
    }
    return { left, top, right, bottom };
}

/**
 * Lay out a Text node into a drawable `CurrentShape`. When `fontSize` is
 * "autofit", first probes an unwrapped single-line layout to derive a scale
 * that fits the box; with wrap enabled, shrinking stops at `minFontSize` and
 * wrapping takes over instead. Returned shape has no `ckPath` (`isText: true`)
 * since glyph paths aren't available — strokes/fills fall back to glyph-union
 * handling elsewhere.
 *
 * The final straight-text layout is memoized in {@link paragraphCache} keyed on
 * the text + font + wrap inputs (the origin is excluded: it's applied at draw
 * time so an animating node position reuses one shape pass). Cache-backed Fonts
 * are owned by the cache and must not be deleted here.
 */
export function buildText(
    canvasKit: CanvasKit,
    canvas: Canvas,
    fontMgr: TypefaceFontProvider,
    state: Partial<TextState>,
    paragraphCache: ParagraphShapeCache,
    fontEpoch: number,
): CurrentShape {
    const fullState = withTextDescriptor(state);

    // Text-on-path: lay each glyph out along the path and draw them with our own
    // per-glyph transforms. `isText: false` (no ckPath) so strokes take the
    // centered Skia-stroke fallback per glyph rather than the glyph-union path
    // (which is meaningless and costly when glyphs are spread along a curve).
    // The shaping (and its Fonts) is memoized inside layoutTextOnPath keyed on
    // the text+font signature, so an animating path only re-maps glyphs onto the
    // new wave each frame; the Fonts the placed glyphs reference are owned by that
    // cache and outlive this draw closure (we must not delete them here).
    if (fullState.path != null) {
        const layout = layoutTextOnPath(canvasKit, fontMgr, state);
        return {
            bounds: layout.bounds,
            draw: (paint: Paint) => drawTextOnPath(canvas, layout.glyphs, paint),
        };
    }

    const x = fullState.x;
    const y = fullState.y;

    const autofit = fullState.fontSize === 'autofit';
    let fontSize = autofit ? 100 : (fullState.fontSize as number);
    let wrap = fullState.wrap && fullState.width > 0;

    const segment = (size: number): ParagraphSegment => ({
        text: fullState.text,
        fontFamily: fullState.fontFamily,
        fontSize: size,
        fontWeight: fullState.fontWeight,
        fontStyle: fullState.fontStyle,
        letterSpacing: fullState.letterSpacing,
    });

    // Autofit: shape once unwrapped to get the intrinsic single-line size, then
    // scale the font so the text fits the box. With wrap on, stop shrinking at
    // minFontSize and let the text wrap instead.
    if (autofit && fullState.width > 0 && fullState.height > 0) {
        const probe = layoutParagraph(canvasKit, fontMgr, [segment(fontSize)], {
            align: fullState.align,
            lineHeight: fullState.lineHeight,
            maxWidth: Infinity,
            originX: x,
            originY: y,
        });
        const scaleW = probe.width > 0 ? fullState.width / probe.width : 1;
        const scaleH = probe.height > 0 ? fullState.height / probe.height : 1;
        const singleLineFit = fontSize * Math.min(scaleW, scaleH);
        for (const f of probe.fonts) f.delete();

        if (wrap && singleLineFit < fullState.minFontSize) {
            fontSize = fullState.minFontSize;
        } else {
            fontSize = singleLineFit;
            wrap = false;
        }
    }

    // Shape at origin (0,0) and cache on the text/font/wrap signature; the node's
    // (x, y) is applied at draw time and to the bounds, so a node that moves every
    // frame (e.g. each Code token) reuses one shaped run instead of re-shaping.
    const maxWidth = wrap ? fullState.width : Infinity;
    const seg = segment(fontSize);
    const key = shapeKey(
        shapeKeyInputsFor(seg, fullState.align, fullState.lineHeight, maxWidth, fullState.width),
        fontEpoch,
    );
    const { layout } = paragraphCache.get(key, () => layoutParagraph(canvasKit, fontMgr, [seg], {
        align: fullState.align,
        lineHeight: fullState.lineHeight,
        maxWidth,
        // When not wrapping, the box width drives `align` placement within the box.
        boxWidth: fullState.width,
        originX: 0,
        originY: 0,
    }));

    // A declared width/height already lands its pivot offset in fullState.x/y
    // (resolvePivotPosition, run before this state ever reaches withTextDescriptor).
    // Without one — the common case, since text usually has no authored box — that
    // offset was computed against a 0×0 box and is a no-op. Text still has a real
    // size once shaped, so redo the offset here against the *measured* box
    // (layout.width/height, y-up and symmetric about the origin-(0,0) shape) instead
    // of leaving `pivot` silently inert. x stays in author (y-up) space; y is
    // already canvas (y-down) at this point, so the pivot's y contribution flips sign.
    const pivot = resolveShapePivot(fullState.pivot);
    const hasDeclaredBox = fullState.width > 0 && fullState.height > 0;
    const boxWidth = hasDeclaredBox ? fullState.width : layout.width;
    const boxHeight = hasDeclaredBox ? fullState.height : layout.height;
    const px = (!hasDeclaredBox && pivot.x !== 0) ? x - pivot.x * (layout.width / 2) : x;
    const py = (!hasDeclaredBox && pivot.y !== 0) ? y + pivot.y * (layout.height / 2) : y;

    // Cached layout is origin-(0,0); shift its bounds into the node's space so
    // bounds-resolved fills (gradients/images) and getShapeBounds() see the same
    // absolute box the original origin-baked layout produced.
    const b = layout.bounds;
    let bounds = { left: b.left + px, top: b.top + py, right: b.right + px, bottom: b.bottom + py };

    const rotation = fullState.rotation;
    const scale = fullState.scale;
    const hasShapeTransform = rotation !== 0 || scale !== 1;
    // Rotation/scale pivot about the same point `applyShapeTransform` (base.ts)
    // uses for path-backed shapes: the pivot mapped onto the box, in canvas space.
    const pivotX = px + pivot.x * (boxWidth / 2);
    const pivotY = py - pivot.y * (boxHeight / 2);

    if (hasShapeTransform) {
        // A path-backed shape reports getShapeBounds() from its already-rotated/
        // scaled geometry; text has no path, so its bounds must be transformed the
        // same way by hand — the enclosing box of the four corners mapped through
        // the same pivot-about rotate+scale the draw call applies below.
        bounds = rotatedBounds(bounds, pivotX, pivotY, rotation, scale);
    }

    return {
        bounds,
        isText: true,
        draw: (paint: Paint) => {
            if (hasShapeTransform) canvas.save();
            try {
                if (hasShapeTransform) {
                    canvas.translate(pivotX, pivotY);
                    canvas.rotate(rotation, 0, 0);
                    canvas.scale(scale, scale);
                    canvas.translate(-pivotX, -pivotY);
                }
                // Apply the node origin as a per-glyph offset (drawGlyphs adds it in
                // the shape's pre-CTM space), NOT a canvas translate — that keeps the
                // glyphs aligned with a shader the fill handler built from the
                // absolute bounds above. Identical placement to baking origin into
                // the positions.
                for (const run of layout.runs) {
                    drawShapedRunAt(canvas, run, px, py, paint);
                }
            } finally {
                if (hasShapeTransform) canvas.restore();
            }
        },
    };
}
