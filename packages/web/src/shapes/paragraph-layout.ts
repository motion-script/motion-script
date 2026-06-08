import type { CanvasKit, Font, Paint, Canvas, TypefaceFontProvider, Typeface } from "@motion-script/canvaskit";
import type { FontStyle, TextAlign } from "@motion-script/core";

/**
 * One styled run of text fed to the paragraph layout. Mirrors the fields the
 * layout engine needs; callers attach their own draw-time data (fills/strokes)
 * separately, keyed by run index.
 */
export interface ParagraphSegment {
    text: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    fontStyle: FontStyle;
    letterSpacing: number;
}

/**
 * A shaped run ready to draw with our own paints. We let CanvasKit's
 * ParagraphBuilder do shaping/line-breaking/positioning (the layout power),
 * but draw via canvas.drawGlyphs with a Font we own (the path-glyph power) so
 * gradient/image fills and glyph-union strokes keep working. We build that Font
 * from the run's own `typeface` (this CanvasKit build hands back the
 * variation-positioned instance, e.g. a variable font at the run's `wght`), so
 * the drawn glyphs match the shaped weight exactly.
 */
export interface ShapedRun {
    /** Index of the originating ParagraphSegment, for mapping fills/strokes. */
    segmentIndex: number;
    glyphs: Uint16Array;
    /** x,y pairs, already offset to the shape's centered coordinate space. */
    positions: Float32Array;
    font: Font;
}

export interface ParagraphLayoutResult {
    runs: ShapedRun[];
    bounds: { left: number; top: number; right: number; bottom: number };
    /** Intrinsic block width/height of the laid-out text. */
    width: number;
    height: number;
    /** Fonts created during layout; caller must delete() each after drawing. */
    fonts: Font[];
}

function fontSlantFor(canvasKit: CanvasKit, style: FontStyle) {
    switch (style) {
        case 'italic':  return canvasKit.FontSlant.Italic;
        case 'oblique': return canvasKit.FontSlant.Oblique;
        default:        return canvasKit.FontSlant.Upright;
    }
}

function textAlignFor(canvasKit: CanvasKit, align: TextAlign) {
    switch (align) {
        case 'left':    return canvasKit.TextAlign.Left;
        case 'right':   return canvasKit.TextAlign.Right;
        case 'justify': return canvasKit.TextAlign.Justify;
        case 'start':   return canvasKit.TextAlign.Start;
        case 'end':     return canvasKit.TextAlign.End;
        default:        return canvasKit.TextAlign.Center;
    }
}

/**
 * Lay out styled segments through ParagraphBuilder and return shaped glyph runs
 * positioned in a coordinate space centered on (originX, originY). `maxWidth`
 * bounds line wrapping; pass Infinity (mapped to a large value) for no wrap.
 *
 * The fontMgr must already have the families registered (loadFont); a private
 * FontCollection wrapping it is created per call.
 */
export function layoutParagraph(
    canvasKit: CanvasKit,
    fontMgr: TypefaceFontProvider,
    segments: ParagraphSegment[],
    opts: {
        align: TextAlign;
        lineHeight: number;
        maxWidth: number;
        /**
         * The node's box width, used to position the text within its box per
         * `align` when not wrapping. When wider than the text, the paragraph is
         * laid out at this width so Skia's TextAlign anchors the glyphs
         * (left/center/right) inside the box instead of centering on the origin.
         */
        boxWidth?: number;
        originX: number;
        originY: number;
    },
): ParagraphLayoutResult {
    const fonts: Font[] = [];
    const empty = segments.every(s => s.text.length === 0);
    if (segments.length === 0 || empty) {
        return { runs: [], bounds: { left: 0, top: 0, right: 0, bottom: 0 }, width: 0, height: 0, fonts };
    }

    const fontCollection = canvasKit.FontCollection.Make();
    fontCollection.setDefaultFontManager(fontMgr);

    const paraStyle = new canvasKit.ParagraphStyle({
        textStyle: { fontFamilies: [segments[0].fontFamily], fontSize: segments[0].fontSize },
        textAlign: textAlignFor(canvasKit, opts.align),
        // heightMultiplier is applied per text style below; keep the paragraph
        // default neutral so per-run line height is honored.
    });

    const builder = canvasKit.ParagraphBuilder.MakeFromFontCollection(paraStyle, fontCollection);
    // Character offset where each segment's text begins, so we can map shaped
    // runs (reported by character range via run order) back to their segment.
    const segmentStartChar: number[] = [];
    let charCursor = 0;
    for (const seg of segments) {
        segmentStartChar.push(charCursor);
        builder.pushStyle(new canvasKit.TextStyle({
            fontFamilies: [seg.fontFamily],
            fontSize: seg.fontSize,
            // `fontStyle.weight` selects the nearest file for *static* families
            // (one file per weight). `fontVariations` drives the `wght` axis for
            // *variable* families (one file, continuous weight) — Skia shapes at
            // that axis position and hands the positioned typeface back on the
            // run, which we draw with. Static fonts ignore the variation
            // harmlessly, so sending both makes one code path serve either kind.
            fontStyle: {
                weight: { value: seg.fontWeight } as never,
                slant: fontSlantFor(canvasKit, seg.fontStyle),
            },
            fontVariations: [{ axis: "wght", value: seg.fontWeight }],
            letterSpacing: seg.letterSpacing,
            heightMultiplier: opts.lineHeight,
        }));
        builder.addText(seg.text);
        builder.pop();
        charCursor += seg.text.length;
    }

    const paragraph = builder.build();
    // Two-pass layout: alignment positions glyphs relative to the layout width,
    // so a huge "no-wrap" width would push centered/right text far off-origin.
    // First measure the intrinsic max width, then lay out at the actual box
    // width (the wrap maxWidth, or the intrinsic width when not wrapping) so
    // alignment offsets land correctly.
    const wrapping = isFinite(opts.maxWidth) && opts.maxWidth > 0;
    paragraph.layout(wrapping ? opts.maxWidth : 1e7);
    // +1px guards against the intrinsic width rounding just under the longest
    // line and spuriously wrapping it.
    const intrinsicWidth = Math.ceil(paragraph.getMaxIntrinsicWidth()) + 1;
    // When not wrapping, lay out at the box width (if it's wider than the text)
    // so Skia's TextAlign anchors the glyphs left/center/right within the box.
    // Falling back to the intrinsic width keeps overflowing text from wrapping.
    const layoutWidth = wrapping
        ? opts.maxWidth
        : Math.max(intrinsicWidth, opts.boxWidth ?? 0);
    paragraph.layout(layoutWidth);

    const blockWidth = paragraph.getLongestLine();
    const blockHeight = paragraph.getHeight();

    // Paragraph lays out from (0,0) at top-left. Glyphs are already positioned
    // within [0, layoutWidth] according to the chosen alignment (e.g. centered
    // glyphs start at (layoutWidth - lineWidth) / 2, not at 0). So the correct
    // anchor is layoutWidth, not blockWidth (the longest line), which would
    // mis-shift aligned glyphs off-center.
    const shiftX = opts.originX - layoutWidth / 2;
    const shiftY = opts.originY - blockHeight / 2;

    // Build one Font per distinct (family,weight,size) from the run's own
    // typeface, which this CanvasKit build returns already positioned at the
    // run's variation axes (e.g. a variable font at its `wght`). Caching by that
    // key means repeated runs of the same style reuse the Font; the typeface
    // handles for those redundant runs are released immediately (the Font keeps
    // its own ref, so the cached Font stays valid after its handle is deleted).
    const fontCache = new Map<string, Font>();
    const fontForRun = (seg: ParagraphSegment, typeface: Typeface | null): Font => {
        const key = `${seg.fontFamily}@${seg.fontWeight}@${seg.fontStyle}@${seg.fontSize}`;
        const cached = fontCache.get(key);
        if (cached) {
            typeface?.delete();
            return cached;
        }
        const font = new canvasKit.Font(typeface, seg.fontSize);
        typeface?.delete();
        fontCache.set(key, font);
        fonts.push(font);
        return font;
    };

    const runs: ShapedRun[] = [];
    const lines = paragraph.getShapedLines();
    for (const line of lines) {
        for (const run of line.runs) {
            const glyphCount = run.glyphs.length;
            if (glyphCount === 0) continue;

            // run.offsets holds the character offset of each glyph (plus a
            // trailing entry); the first pins the run to its style segment.
            const segmentIndex = segmentIndexAt(segmentStartChar, segments, run.offsets[0]);

            const font = fontForRun(segments[segmentIndex], run.typeface);

            // positions hold one extra trailing pair; copy just the glyph pairs
            // and apply the centering shift.
            const positions = new Float32Array(glyphCount * 2);
            for (let i = 0; i < glyphCount; i++) {
                positions[i * 2] = run.positions[i * 2] + shiftX;
                positions[i * 2 + 1] = run.positions[i * 2 + 1] + shiftY;
            }
            runs.push({ segmentIndex, glyphs: run.glyphs.slice(0, glyphCount), positions, font });
        }
    }

    const bounds = blockWidth > 0 && blockHeight > 0
        ? { left: shiftX, top: shiftY, right: shiftX + layoutWidth, bottom: shiftY + blockHeight }
        : { left: 0, top: 0, right: 0, bottom: 0 };

    paragraph.delete();
    builder.delete();
    fontCollection.delete();

    return { runs, bounds, width: blockWidth, height: blockHeight, fonts };
}

// Find the segment whose character range [start, start+len) contains charPos.
function segmentIndexAt(starts: number[], segments: ParagraphSegment[], charPos: number): number {
    for (let i = 0; i < segments.length; i++) {
        const len = segments[i].text.length;
        if (len > 0 && charPos >= starts[i] && charPos < starts[i] + len) return i;
    }
    // Fallback: last non-empty segment (e.g. charPos at end-of-text).
    for (let i = segments.length - 1; i >= 0; i--) {
        if (segments[i].text.length > 0) return i;
    }
    return 0;
}

/** Draw a shaped run with the given paint via our own glyph pipeline. */
export function drawShapedRun(canvas: Canvas, run: ShapedRun, paint: Paint): void {
    canvas.drawGlyphs(run.glyphs, run.positions, 0, 0, run.font, paint);
}
