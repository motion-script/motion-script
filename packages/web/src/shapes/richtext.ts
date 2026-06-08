import type { CanvasKit, Font, TypefaceFontProvider } from "@motion-script/canvaskit";
import { RichTextState, ResolvedTextSpan } from "@motion-script/core";
import { layoutParagraph, type ParagraphSegment, type ShapedRun } from "./paragraph-layout";

/**
 * A shaped run ready to draw, paired with the span that styled it so the
 * caller can apply that span's resolved fills/strokes.
 */
export interface LaidOutRun extends ShapedRun {
    span: ResolvedTextSpan;
}

export interface RichTextLayout {
    runs: LaidOutRun[];
    bounds: { left: number; top: number; right: number; bottom: number };
    /** Fonts created during layout. Caller must delete() each after drawing. */
    fonts: Font[];
}

/**
 * Lay out rich text via ParagraphBuilder (line-breaking, alignment, per-span
 * sizing/spacing) and return shaped glyph runs we draw with our own paints, so
 * per-span gradient/image fills and glyph strokes keep working.
 */
export function layoutRichText(
    canvasKit: CanvasKit,
    fontMgr: TypefaceFontProvider,
    state: RichTextState,
): RichTextLayout {
    const { spans, lineHeight, align, width } = state;

    const segments: ParagraphSegment[] = spans.map(s => ({
        text: s.text,
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        fontStyle: s.fontStyle,
        letterSpacing: s.letterSpacing,
    }));

    const layout = layoutParagraph(canvasKit, fontMgr, segments, {
        align,
        lineHeight,
        // RichText boxes are hug/explicit; wrap only when a finite width exists.
        maxWidth: width > 0 ? width : Infinity,
        // Box width drives `align` placement within the box when not wrapping.
        boxWidth: width,
        // RichText draws in the node's centered local space (origin 0,0).
        originX: 0,
        originY: 0,
    });

    const runs: LaidOutRun[] = layout.runs.map(run => ({
        ...run,
        span: spans[run.segmentIndex],
    }));

    return { runs, bounds: layout.bounds, fonts: layout.fonts };
}
