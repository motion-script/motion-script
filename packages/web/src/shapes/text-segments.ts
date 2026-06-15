import type { CanvasKit, Font, TypefaceFontProvider } from "@motion-script/canvaskit";
import { TextState, TextSegment, withTextDescriptor } from "@motion-script/core";
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
 * Lay out a selection-segmented Text node. Each {@link TextSegment} carries its
 * effective shaping inputs (text/fontWeight/letterSpacing), so weight/spacing
 * overrides reshape correctly while kerning/wrap/align stay consistent across
 * the whole paragraph (one `layoutParagraph` call). Runs are mapped back to
 * their segment via `segmentIndex` for per-run override application.
 *
 * Autofit is not segment-aware (selections target explicit-size text); when
 * `fontSize` is "autofit" we fall back to a fixed 100 probe-free size so the
 * pieces still shape — autofit + selections is an uncommon combination.
 */
export function layoutTextSegments(
    canvasKit: CanvasKit,
    fontMgr: TypefaceFontProvider,
    state: Partial<TextState>,
): SegmentedTextLayout {
    const full = withTextDescriptor(state);
    const segments = full.segments ?? [];
    const fontSize = full.fontSize === 'autofit' ? 100 : full.fontSize;

    const paragraphSegments: ParagraphSegment[] = segments.map(seg => ({
        text: seg.text,
        fontFamily: full.fontFamily,
        fontSize,
        fontWeight: seg.fontWeight,
        fontStyle: full.fontStyle,
        letterSpacing: seg.letterSpacing,
    }));

    const wrap = full.wrap && full.width > 0;
    const layout = layoutParagraph(canvasKit, fontMgr, paragraphSegments, {
        align: full.align,
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
