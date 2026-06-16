import type { CanvasKit, Font, Paint, Canvas, TypefaceFontProvider, Typeface } from "@motion-script/canvaskit";
import { TextState, withTextDescriptor, createPathSampler, type PathSampler, type FontStyle } from "@motion-script/core";

/**
 * Text-on-path layout: shape the string with ParagraphBuilder (so kerning,
 * letterSpacing and font variations stay correct), then re-map each shaped glyph
 * from its flat baseline position onto the path. Each glyph is positioned and
 * rotated to follow the path tangent and centered on its horizontal advance;
 * glyphs whose center falls before the path start or past its end are clipped.
 *
 * v1: single line only (newlines/wrap are ignored upstream), left-aligned
 * shaping with `align` applied as a distance offset along the path. We draw each
 * glyph with our own `canvas.drawGlyphs` (one transformed draw per glyph) so the
 * normal fill/stroke/shadow handling still applies to the returned shape.
 */

/** One placed glyph: drawn at (x,y) rotated by `angle`, offset back by half its advance to center it. */
interface PlacedGlyph {
    glyphId: number;
    x: number;
    y: number;
    /** Rotation in degrees (canvas.rotate takes degrees). */
    angle: number;
    /** Half the glyph's advance, so the glyph body straddles the path point. */
    halfAdvance: number;
    font: Font;
}

export interface TextPathLayout {
    glyphs: PlacedGlyph[];
    bounds: { left: number; top: number; right: number; bottom: number };
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

/**
 * Distance along the path where the text run starts, per `align`. `left`/`start`
 * begins at the path start; `center` centers the run along the path; `right`/`end`
 * ends the run at the path end. Mirrors the horizontal anchoring `align` gives
 * straight text, but measured in path arc length.
 */
function alignOffset(align: TextState["align"], textWidth: number, pathLength: number): number {
    switch (align) {
        case 'right':
        case 'end':
            return pathLength - textWidth;
        case 'center':
            return (pathLength - textWidth) / 2;
        default: // 'left' | 'start' | 'justify'
            return 0;
    }
}

export function layoutTextOnPath(
    canvasKit: CanvasKit,
    fontMgr: TypefaceFontProvider,
    state: Partial<TextState>,
): TextPathLayout {
    const full = withTextDescriptor(state);
    const fonts: Font[] = [];
    const empty: TextPathLayout = { glyphs: [], bounds: { left: 0, top: 0, right: 0, bottom: 0 }, fonts };

    if (full.text.length === 0 || full.path == null) return empty;

    const sampler: PathSampler = createPathSampler(full.path);
    if (sampler.length <= 0) return empty;

    // Autofit has no meaning on a path (no box to fit); use a fixed fallback size
    // like the segmented path does, so the text still shapes.
    const fontSize = full.fontSize === 'autofit' ? 100 : full.fontSize;

    // Shape left-aligned with no wrap/box so glyph x-positions are pure distance
    // from the text start; `align` is then applied as a path-distance offset.
    const fontCollection = canvasKit.FontCollection.Make();
    fontCollection.setDefaultFontManager(fontMgr);

    const paraStyle = new canvasKit.ParagraphStyle({
        textStyle: { fontFamilies: [full.fontFamily], fontSize },
        textAlign: canvasKit.TextAlign.Left,
    });
    const builder = canvasKit.ParagraphBuilder.MakeFromFontCollection(paraStyle, fontCollection);
    builder.pushStyle(new canvasKit.TextStyle({
        fontFamilies: [full.fontFamily],
        fontSize,
        fontStyle: {
            weight: { value: full.fontWeight } as never,
            slant: fontSlantFor(canvasKit, full.fontStyle),
        },
        fontVariations: [{ axis: "wght", value: full.fontWeight }],
        letterSpacing: full.letterSpacing,
        heightMultiplier: full.lineHeight,
    }));
    // v1 flows the whole string as one line along the path, so collapse newlines
    // to spaces rather than letting them break into lines we'd then drop.
    builder.addText(full.text.replace(/\s*\n\s*/g, " "));
    builder.pop();

    const paragraph = builder.build();
    paragraph.layout(1e7); // effectively unbounded — single line, no wrap.

    // Build a Font per distinct typeface (mirrors layoutParagraph): the run's
    // typeface comes back variation-positioned at the run's weight.
    const fontCache = new Map<string, Font>();
    const fontForRun = (typeface: Typeface | null): Font => {
        const key = `${full.fontFamily}@${full.fontWeight}@${full.fontStyle}@${fontSize}`;
        const cached = fontCache.get(key);
        if (cached) { typeface?.delete(); return cached; }
        const font = new canvasKit.Font(typeface, fontSize);
        typeface?.delete();
        fontCache.set(key, font);
        fonts.push(font);
        return font;
    };

    const lines = paragraph.getShapedLines();
    // Single line: use the first line's runs. (wrap is forced off upstream.)
    const line = lines[0];
    if (!line) {
        paragraph.delete(); builder.delete(); fontCollection.delete();
        return empty;
    }

    // Total advance of the run(s) on this line = its right edge, used for align.
    let textWidth = 0;
    for (const run of line.runs) {
        const n = run.glyphs.length;
        if (n > 0) textWidth = Math.max(textWidth, run.positions[n * 2]); // trailing slot x
    }
    const offset = alignOffset(full.align, textWidth, sampler.length);

    const glyphs: PlacedGlyph[] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const expand = (x: number, y: number) => {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    };

    for (const run of line.runs) {
        const n = run.glyphs.length;
        if (n === 0) continue;
        const font = fontForRun(run.typeface);

        for (let i = 0; i < n; i++) {
            const startX = run.positions[i * 2];
            const advance = run.positions[(i + 1) * 2] - startX; // trailing slot makes this valid for the last glyph
            const midX = startX + advance / 2;
            const d = midX + offset;
            if (d < 0 || d > sampler.length) continue; // clip overflow

            const frame = sampler.frameAt(d);
            if (!frame) continue;

            // perp: glyph baseline offset from the line baseline. Zero for a single
            // line; kept for correctness. Normal N = (-ty, tx) (y-down canvas).
            const perp = run.positions[i * 2 + 1] - line.baseline;
            const x = frame.x + perp * -frame.ty;
            const y = frame.y + perp * frame.tx;
            const angle = Math.atan2(frame.ty, frame.tx) * 180 / Math.PI;

            glyphs.push({ glyphId: run.glyphs[i], x, y, angle, halfAdvance: advance / 2, font });
            expand(x, y);
        }
    }

    paragraph.delete();
    builder.delete();
    fontCollection.delete();

    // Pad the bounds by the font size so glyph extents (ascenders/descenders) are
    // covered — glyph outlines extend beyond their pen point. Conservative is fine.
    const pad = fontSize;
    const bounds = glyphs.length > 0
        ? { left: minX - pad, top: minY - pad, right: maxX + pad, bottom: maxY + pad }
        : { left: 0, top: 0, right: 0, bottom: 0 };

    return { glyphs, bounds, fonts };
}

/** Draw placed glyphs, one transformed draw per glyph (rotates about the glyph center). */
export function drawTextOnPath(canvas: Canvas, glyphs: PlacedGlyph[], paint: Paint): void {
    for (const g of glyphs) {
        canvas.save();
        canvas.translate(g.x, g.y);
        if (g.angle !== 0) canvas.rotate(g.angle, 0, 0);
        // Draw the single glyph offset back by half its advance so its body is
        // centered over the (translated) path point before rotation.
        canvas.drawGlyphs([g.glyphId], new Float32Array([-g.halfAdvance, 0]), 0, 0, g.font, paint);
        canvas.restore();
    }
}
