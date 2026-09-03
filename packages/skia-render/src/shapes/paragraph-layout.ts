import type { CanvasKit, Font, Paint, Canvas, TypefaceFontProvider, Typeface } from "@motion-script/canvaskit";
import type { FontStyle, TextAlign, TextBlockLayout, TextBlockLine } from "@motion-script/core";

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

function textAlignFor(canvasKit: CanvasKit, textAlign: TextAlign) {
    switch (textAlign) {
        case 'left':    return canvasKit.TextAlign.Left;
        case 'right':   return canvasKit.TextAlign.Right;
        case 'justify': return canvasKit.TextAlign.Justify;
        case 'start':   return canvasKit.TextAlign.Start;
        case 'end':     return canvasKit.TextAlign.End;
        default:        return canvasKit.TextAlign.Center;
    }
}

/** Options both the glyph pass and the caret pass lay out with. */
interface ParagraphLayoutOptions {
    textAlign: TextAlign;
    lineHeight: number;
    maxWidth: number;
    boxWidth?: number;
    originX: number;
    originY: number;
}

/** A built, laid-out paragraph plus everything derived from its two-pass layout. */
interface LaidOutParagraph {
    paragraph: ReturnType<ReturnType<CanvasKit["ParagraphBuilder"]["MakeFromFontCollection"]>["build"]>;
    builder: ReturnType<CanvasKit["ParagraphBuilder"]["MakeFromFontCollection"]>;
    fontCollection: ReturnType<CanvasKit["FontCollection"]["Make"]>;
    /** Character offset each segment's text begins at. */
    segmentStartChar: number[];
    layoutWidth: number;
    blockWidth: number;
    blockHeight: number;
    shiftX: number;
    shiftY: number;
}

/**
 * Build and lay out the paragraph, and derive the centring shift.
 *
 * Shared by {@link layoutParagraph} (which reads glyphs out of it) and
 * {@link layoutTextBlock} (which reads caret positions). Deliberately one
 * function rather than two that construct the same styles: a caret is only
 * useful if it sits exactly where the glyph does, and every input here —
 * the weight variation, the height multiplier, the two-pass width, the
 * alignment anchor — moves both together or neither.
 *
 * The caller owns the returned handles and must delete all three.
 */
function layOutParagraph(
    canvasKit: CanvasKit,
    fontMgr: TypefaceFontProvider,
    segments: ParagraphSegment[],
    opts: ParagraphLayoutOptions,
): LaidOutParagraph {
    const fontCollection = canvasKit.FontCollection.Make();
    fontCollection.setDefaultFontManager(fontMgr);

    const paraStyle = new canvasKit.ParagraphStyle({
        textStyle: { fontFamilies: [segments[0].fontFamily], fontSize: segments[0].fontSize },
        textAlign: textAlignFor(canvasKit, opts.textAlign),
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

    return { paragraph, builder, fontCollection, segmentStartChar, layoutWidth, blockWidth, blockHeight, shiftX, shiftY };
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
    /**
     * `boxWidth` is the node's box width, used to position the text within its box
     * per `textAlign` when not wrapping. When wider than the text, the paragraph is
     * laid out at this width so Skia's TextAlign anchors the glyphs
     * (left/center/right) inside the box instead of centering on the origin.
     */
    opts: ParagraphLayoutOptions,
): ParagraphLayoutResult {
    const fonts: Font[] = [];
    const empty = segments.every(s => s.text.length === 0);
    if (segments.length === 0 || empty) {
        return { runs: [], bounds: { left: 0, top: 0, right: 0, bottom: 0 }, width: 0, height: 0, fonts };
    }

    const laid = layOutParagraph(canvasKit, fontMgr, segments, opts);
    const { paragraph, builder, fontCollection, segmentStartChar, layoutWidth, blockWidth, blockHeight, shiftX, shiftY } = laid;

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

            // CanvasKit merges adjacent text with identical *shaping* style into
            // one run even when the segments differ only in paint (fill/stroke).
            // run.offsets holds each glyph's character offset, so split the run
            // into maximal contiguous slices that map to the same segment — that
            // way per-segment fills/strokes/overrides apply even to same-styled
            // neighbours. The run's typeface (hence Font) is shared across all
            // slices, so build it once: every slice of a run shapes at the same
            // weight, so they share a cache key regardless of segment paint.
            const font = fontForRun(segments[segmentIndexAt(segmentStartChar, segments, run.offsets[0])], run.typeface);
            let sliceStart = 0;
            let sliceSeg = segmentIndexAt(segmentStartChar, segments, run.offsets[0]);
            const flush = (end: number) => {
                const count = end - sliceStart;
                if (count <= 0) return;
                const positions = new Float32Array(count * 2);
                for (let i = 0; i < count; i++) {
                    positions[i * 2] = run.positions[(sliceStart + i) * 2] + shiftX;
                    positions[i * 2 + 1] = run.positions[(sliceStart + i) * 2 + 1] + shiftY;
                }
                runs.push({
                    segmentIndex: sliceSeg,
                    glyphs: run.glyphs.slice(sliceStart, end),
                    positions,
                    font,
                });
            };
            for (let i = 1; i < glyphCount; i++) {
                const seg = segmentIndexAt(segmentStartChar, segments, run.offsets[i]);
                if (seg !== sliceSeg) {
                    flush(i);
                    sliceStart = i;
                    sliceSeg = seg;
                }
            }
            flush(glyphCount);
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

/**
 * Lay text out exactly as {@link layoutParagraph} would and report where every
 * *caret slot* landed, block-local and centred on the origin — the measurement
 * core's `getTextLayout` lifts into viewport space so a host can draw its own
 * cursor and selection over the rendered glyphs.
 *
 * Slots, not glyph boxes: a cursor lives between characters, so a line of n
 * characters has n + 1 positions. Each is taken from Skia's own rect for the
 * character (its leading edge, and the trailing edge of the last one on the
 * line), which is what keeps the cursor on the glyph through kerning, letter
 * spacing and alignment rather than beside it.
 *
 * Line boxes come from `getLineMetrics`, so the caret is as tall as the line the
 * renderer actually laid out — including the `lineHeight` multiplier, which is a
 * different quantity from the font size and cannot be recovered from it, and
 * including the tallest run on a line of mixed sizes.
 *
 * Takes one segment or a list of them, because a block whose runs are styled
 * differently is still one paragraph — see the note at the top of the body.
 *
 * Returns `null` for text this model doesn't describe: nothing to lay out.
 */
export function layoutTextBlock(
    canvasKit: CanvasKit,
    fontMgr: TypefaceFontProvider,
    segments: ParagraphSegment | ParagraphSegment[],
    opts: ParagraphLayoutOptions,
): TextBlockLayout | null {
    // One segment or many, and the many is not a special case: a paragraph of
    // differently-styled runs is laid out by the same builder as a paragraph of
    // one, and Skia reports its character rects against the whole string either
    // way. So the slots below are read off the paragraph, not off any segment,
    // and a block whose second word is set in another face measures its cursor
    // through that face without this function knowing which run it landed in.
    const runs = Array.isArray(segments) ? segments : [segments];
    const text = runs.map(run => run.text).join("");

    if (runs.length === 0 || text.length === 0) {
        // An empty run still has one slot to put a cursor in, and it needs a line
        // box with the right height — so measure a stand-in glyph and keep only
        // its vertical extent. Without this, clicking into emptied text would
        // give a zero-height caret.
        const style = runs[0];
        if (!style) return null;
        const probe = layoutTextBlock(canvasKit, fontMgr, { ...style, text: "M" }, opts);
        if (!probe) return null;
        const line = probe.lines[0];
        return {
            lines: [{ start: 0, end: 0, top: line.top, bottom: line.bottom, carets: [0] }],
            width: 0,
            height: probe.height,
        };
    }

    const laid = layOutParagraph(canvasKit, fontMgr, runs, opts);
    const { paragraph, builder, fontCollection, blockWidth, blockHeight, shiftX, shiftY } = laid;
    const lineMetrics = paragraph.getLineMetrics();
    const lines: TextBlockLine[] = [];
    // Where the line being read begins. Tracked rather than taken from each
    // line's own `startIndex`, for the reason spelled out below.
    let cursor = 0;
    for (let n = 0; n < lineMetrics.length; n++) {
        const metrics = lineMetrics[n];
        const start = cursor;
        // Skia reports three ends per line and they disagree about what a line
        // contains — `endExcludingWhitespaces` drops trailing spaces a cursor is
        // entitled to sit after, and `endIndex` was assumed to drop the hard
        // break but does not: for `"abc\n"` it comes back as 4, and the trailing
        // empty line is then reported as *starting* at 3. Two lines that overlap
        // like that make the caret array write index 3 twice — once as the end of
        // line one, once as the empty line's only slot — so the cursor after a
        // newline landed at the right-hand end of the text it had just left.
        //
        // So the ranges are derived rather than read: the largest end still
        // inside the text says where the *next* line starts, the running cursor
        // says where this one did, and the hard break is put back on neither side
        // by looking at the character itself. A soft wrap keeps its trailing
        // space, which is the behaviour that was wanted all along.
        const next = n === lineMetrics.length - 1
            ? text.length
            : Math.min(
                text.length,
                Math.max(
                    start,
                    metrics.endIncludingNewline,
                    metrics.endIndex,
                    metrics.endExcludingWhitespaces,
                ),
            );
        const end = next > start && text[next - 1] === "\n" ? next - 1 : next;
        cursor = next;
        const top = metrics.baseline - metrics.ascent + shiftY;
        const bottom = metrics.baseline + metrics.descent + shiftY;

        const carets: number[] = [];
        for (let i = start; i < end; i++) {
            carets.push(charEdge(paragraph, canvasKit, i, false) + shiftX);
        }
        // One more slot after the last character — the position a cursor sits in
        // at end of line, which no character's leading edge describes.
        //
        // An empty line has no character to measure against at all, and asking
        // for the rect of one past the end of the text answers nothing — which
        // used to fall back to 0 and put the caret at the left of the layout box
        // whatever the alignment said. The line box's own left edge is the
        // answer: it is where this line's first glyph *would* start, already
        // shifted by the alignment, which is exactly what a cursor on an empty
        // line is pointing at.
        carets.push(end > start
            ? charEdge(paragraph, canvasKit, end - 1, true) + shiftX
            : metrics.left + shiftX);

        lines.push({ start, end, top, bottom, carets });
    }

    paragraph.delete();
    builder.delete();
    fontCollection.delete();

    return lines.length === 0 ? null : { lines, width: blockWidth, height: blockHeight };
}

/** The leading (or trailing) x edge of the character at `index`. */
function charEdge(
    paragraph: LaidOutParagraph["paragraph"],
    canvasKit: CanvasKit,
    index: number,
    trailing: boolean,
): number {
    // Tight width so the edge is the glyph's own advance, not the line box's;
    // Max height so the rect exists even for a zero-width character.
    const rects = paragraph.getRectsForRange(
        index,
        index + 1,
        canvasKit.RectHeightStyle.Max,
        canvasKit.RectWidthStyle.Tight,
    );
    const rect = rects[0]?.rect;
    if (!rect) return 0;
    return trailing ? rect[2] : rect[0];
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

/**
 * Draw a shaped run offset by (dx, dy). `drawGlyphs`' x/y args add to every glyph
 * position in the shape's own (pre-CTM) space, so this places origin-(0,0) cached
 * glyphs exactly where baking the origin into the positions would — keeping
 * bounds-resolved fills (gradients/images) aligned without a canvas transform.
 */
export function drawShapedRunAt(canvas: Canvas, run: ShapedRun, dx: number, dy: number, paint: Paint): void {
    canvas.drawGlyphs(run.glyphs, run.positions, dx, dy, run.font, paint);
}
