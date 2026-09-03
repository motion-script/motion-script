import type { CanvasKit, Font, TypefaceFontProvider } from "@motion-script/canvaskit";
import { AUTOFIT_PROBE_SIZE, TextState, TextSegment, withTextDescriptor } from "@motion-script/core";
import { layoutParagraph, type ParagraphSegment, type ShapedRun } from "./paragraph-layout";

/**
 * A shaped run paired with the {@link TextSegment} that styled it, so the
 * caller can apply that segment's per-selection overrides (opacity, transform,
 * fill/stroke) when drawing.
 */
export interface SegmentedRun extends ShapedRun {
    segment: TextSegment;
}

export interface SegmentedTextLayout {
    runs: SegmentedRun[];
    bounds: { left: number; top: number; right: number; bottom: number };
    /** Fonts created during layout. Caller must delete() each after drawing. */
    fonts: Font[];
}

/**
 * The {@link ParagraphSegment}s a segmented Text node shapes as, each resolved
 * against the node's own style for the fields it leaves unstated.
 *
 * Shared by {@link layoutTextSegments} and `textBlockLayout` so the glyphs and
 * the caret slots are built from *one* reading of the segments — the same reason
 * `resolveTextShaping` is shared on the unsegmented path. Two derivations of
 * this is how a cursor ends up a face wider than the character it sits after.
 */
export function segmentParagraphs(full: TextState): ParagraphSegment[] {
    const fontSize = full.fontSize === 'autofit' ? AUTOFIT_PROBE_SIZE : full.fontSize;
    return (full.segments ?? []).map(seg => ({
        text: seg.text,
        fontFamily: seg.fontFamily ?? full.fontFamily,
        fontSize: seg.fontSize ?? fontSize,
        fontWeight: seg.fontWeight,
        fontStyle: seg.fontStyle ?? full.fontStyle,
        letterSpacing: seg.letterSpacing,
    }));
}

/**
 * Lay out a selection-segmented Text node. Each {@link TextSegment} carries its
 * own five shaping fields, so a run styled in another face, size, slant, weight
 * or spacing reshapes correctly while kerning, wrapping and textAlign stay
 * consistent across the whole paragraph (one `layoutParagraph` call). Runs are
 * mapped back to their segment via `segmentIndex` for per-run override
 * application.
 *
 * Autofit is not segment-aware (selections target explicit-size text); when
 * `fontSize` is "autofit" the pieces shape at a fixed probe size instead — the
 * same one a selection's `fontSize` override starts from, so the node and its
 * selections agree about what they are sized against.
 */
export function layoutTextSegments(
    canvasKit: CanvasKit,
    fontMgr: TypefaceFontProvider,
    state: Partial<TextState>,
): SegmentedTextLayout {
    const full = withTextDescriptor(state);
    const segments = full.segments ?? [];

    const paragraphSegments = segmentParagraphs(full);

    const wrap = full.wrap && full.width > 0;
    const layout = layoutParagraph(canvasKit, fontMgr, paragraphSegments, {
        textAlign: full.textAlign,
        lineHeight: full.lineHeight,
        maxWidth: wrap ? full.width : Infinity,
        boxWidth: full.width,
        originX: full.x,
        originY: full.y,
    });

    const runs: SegmentedRun[] = layout.runs.map(run => ({
        ...run,
        segment: segments[run.segmentIndex],
    }));

    return { runs, bounds: layout.bounds, fonts: layout.fonts };
}

/**
 * Centre of a shaped run's glyph positions, used as the pivot for the run's
 * per-segment transform so scale/rotation pivot about the glyphs, not the
 * paragraph origin.
 */
export function runCenter(run: ShapedRun): { x: number; y: number } {
    const p = run.positions;
    if (p.length === 0) return { x: 0, y: 0 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
        const x = p[i], y = p[i + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
