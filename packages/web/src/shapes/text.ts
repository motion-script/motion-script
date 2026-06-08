import type { CanvasKit, Canvas, Paint, TypefaceFontProvider } from "@motion-script/canvaskit";
import { TextState, withTextDescriptor } from "@motion-script/core";
import type { CurrentShape } from "./shape-handler";
import { layoutParagraph, drawShapedRun, type ParagraphSegment } from "./paragraph-layout";

/**
 * Lay out a Text node into a drawable `CurrentShape`. When `fontSize` is
 * "autofit", first probes an unwrapped single-line layout to derive a scale
 * that fits the box; with wrap enabled, shrinking stops at `minFontSize` and
 * wrapping takes over instead. Returned shape has no `ckPath` (`isText: true`)
 * since glyph paths aren't available — strokes/fills fall back to glyph-union
 * handling elsewhere.
 */
export function buildText(
    canvasKit: CanvasKit,
    canvas: Canvas,
    fontMgr: TypefaceFontProvider,
    state: Partial<TextState>,
): CurrentShape {
    const fullState = withTextDescriptor(state);
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

    const layout = layoutParagraph(canvasKit, fontMgr, [segment(fontSize)], {
        align: fullState.align,
        lineHeight: fullState.lineHeight,
        maxWidth: wrap ? fullState.width : Infinity,
        // When not wrapping, the box width drives `align` placement within the box.
        boxWidth: fullState.width,
        originX: x,
        originY: y,
    });

    return {
        bounds: layout.bounds,
        isText: true,
        draw: (paint: Paint) => {
            for (const run of layout.runs) {
                drawShapedRun(canvas, run, paint);
            }
        },
    };
}
