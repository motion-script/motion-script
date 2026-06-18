import type { CanvasKit, Font, Paint, Canvas, TypefaceFontProvider, Typeface } from "@motion-script/canvaskit";
import { TextState, withTextDescriptor, createPathSampler, type PathData, type PathSampler, type FontStyle } from "@motion-script/core";

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
 *
 * The shaping work (ParagraphBuilder, font creation, per-glyph advances) depends
 * only on the *text + font* inputs, never on the path — so an animating wave that
 * rewrites `path` every frame would re-shape the whole string 60×/s for nothing.
 * It's split into two phases: {@link shapeTextRun} (memoized on the shaping
 * signature, owns the `Font`s) and {@link mapRunToPath} (cheap per-frame remap
 * onto the current path). {@link layoutTextOnPath} composes them.
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
}

/** One shaped glyph in flat baseline space — everything the path remap needs, with no path baked in. */
interface ShapedGlyph {
    glyphId: number;
    /** Distance of the glyph centre from the run start (used as arc-length along the path). */
    midX: number;
    /** Glyph advance, so the body can straddle its path point by half. */
    advance: number;
    /** Baseline offset from the line baseline (0 for a single line; kept for correctness). */
    perp: number;
    font: Font;
}

/** Path-independent result of shaping a run: the glyphs, the run width (for align), and the size used. */
interface ShapedRun {
    glyphs: ShapedGlyph[];
    textWidth: number;
    fontSize: number;
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

// ─── Shape-phase memo ────────────────────────────────────────────────────────
//
// A ShapedRun owns CanvasKit Font objects, so the cache must delete() them on
// eviction (mirrors GradientShaderCache). The entry is path-independent, so an
// animating path reuses one shape pass for its whole flutter. Bounded so many
// distinct strings/fonts can't grow the map without limit.

interface ShapeCacheEntry {
    run: ShapedRun;
    fonts: Font[];
}

const SHAPE_CACHE_LIMIT = 64;
const shapeCache = new Map<string, ShapeCacheEntry>();

function shapeSignature(full: TextState, fontSize: number): string {
    return [
        full.text,
        full.fontFamily,
        fontSize,
        full.fontWeight,
        full.fontStyle,
        full.letterSpacing,
        full.lineHeight,
    ].join("");
}

/**
 * Shape the run with ParagraphBuilder and reduce it to path-independent glyphs.
 * Memoized on the shaping signature; the returned {@link ShapedRun} (and the
 * `Font`s it references) is owned by the cache and must not be deleted by callers.
 */
function shapeTextRun(
    canvasKit: CanvasKit,
    fontMgr: TypefaceFontProvider,
    full: TextState,
    fontSize: number,
): ShapedRun | null {
    const key = shapeSignature(full, fontSize);
    const cached = shapeCache.get(key);
    if (cached) {
        // Refresh recency so the Map iteration order acts as a simple LRU.
        shapeCache.delete(key);
        shapeCache.set(key, cached);
        return cached.run;
    }

    const run = buildShapedRun(canvasKit, fontMgr, full, fontSize);
    if (!run) return null;

    shapeCache.set(key, { run: run.run, fonts: run.fonts });
    if (shapeCache.size > SHAPE_CACHE_LIMIT) {
        const oldest = shapeCache.keys().next().value as string | undefined;
        if (oldest !== undefined) {
            const evicted = shapeCache.get(oldest);
            shapeCache.delete(oldest);
            if (evicted) for (const f of evicted.fonts) f.delete();
        }
    }
    return run.run;
}

/** The actual ParagraphBuilder shaping pass; returns the run plus the Fonts it created. */
function buildShapedRun(
    canvasKit: CanvasKit,
    fontMgr: TypefaceFontProvider,
    full: TextState,
    fontSize: number,
): { run: ShapedRun; fonts: Font[] } | null {
    const fonts: Font[] = [];

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
        const fkey = `${full.fontFamily}@${full.fontWeight}@${full.fontStyle}@${fontSize}`;
        const c = fontCache.get(fkey);
        if (c) { typeface?.delete(); return c; }
        const font = new canvasKit.Font(typeface, fontSize);
        typeface?.delete();
        fontCache.set(fkey, font);
        fonts.push(font);
        return font;
    };

    const lines = paragraph.getShapedLines();
    // Single line: use the first line's runs. (wrap is forced off upstream.)
    const line = lines[0];
    if (!line) {
        paragraph.delete(); builder.delete(); fontCollection.delete();
        for (const f of fonts) f.delete();
        return null;
    }

    // Total advance of the run(s) on this line = its right edge, used for align.
    let textWidth = 0;
    for (const run of line.runs) {
        const n = run.glyphs.length;
        if (n > 0) textWidth = Math.max(textWidth, run.positions[n * 2]); // trailing slot x
    }

    const glyphs: ShapedGlyph[] = [];
    for (const run of line.runs) {
        const n = run.glyphs.length;
        if (n === 0) continue;
        const font = fontForRun(run.typeface);

        for (let i = 0; i < n; i++) {
            const startX = run.positions[i * 2];
            const advance = run.positions[(i + 1) * 2] - startX; // trailing slot makes this valid for the last glyph
            const midX = startX + advance / 2;
            // perp: glyph baseline offset from the line baseline. Zero for a single
            // line; kept for correctness.
            const perp = run.positions[i * 2 + 1] - line.baseline;
            glyphs.push({ glyphId: run.glyphs[i], midX, advance, perp, font });
        }
    }

    paragraph.delete();
    builder.delete();
    fontCollection.delete();

    return { run: { glyphs, textWidth, fontSize }, fonts };
}

// ─── Map phase ───────────────────────────────────────────────────────────────

/**
 * Map an already-shaped run onto `path`: sample the path by arc length and place
 * each glyph at its centre distance, rotated to the tangent. Cheap — no shaping,
 * no font creation — so it's safe to run every frame as the path animates.
 */
function mapRunToPath(run: ShapedRun, path: PathData, align: TextState["align"]): TextPathLayout {
    const empty: TextPathLayout = { glyphs: [], bounds: { left: 0, top: 0, right: 0, bottom: 0 } };

    const sampler: PathSampler = createPathSampler(path);
    if (sampler.length <= 0) return empty;

    const offset = alignOffset(align, run.textWidth, sampler.length);

    const glyphs: PlacedGlyph[] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const expand = (x: number, y: number) => {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    };

    for (const g of run.glyphs) {
        const d = g.midX + offset;
        if (d < 0 || d > sampler.length) continue; // clip overflow

        const frame = sampler.frameAt(d);
        if (!frame) continue;

        // Normal N = (-ty, tx) (y-down canvas).
        const x = frame.x + g.perp * -frame.ty;
        const y = frame.y + g.perp * frame.tx;
        const angle = Math.atan2(frame.ty, frame.tx) * 180 / Math.PI;

        glyphs.push({ glyphId: g.glyphId, x, y, angle, halfAdvance: g.advance / 2, font: g.font });
        expand(x, y);
    }

    // Pad the bounds by the font size so glyph extents (ascenders/descenders) are
    // covered — glyph outlines extend beyond their pen point. Conservative is fine.
    const pad = run.fontSize;
    const bounds = glyphs.length > 0
        ? { left: minX - pad, top: minY - pad, right: maxX + pad, bottom: maxY + pad }
        : { left: 0, top: 0, right: 0, bottom: 0 };

    return { glyphs, bounds };
}

export function layoutTextOnPath(
    canvasKit: CanvasKit,
    fontMgr: TypefaceFontProvider,
    state: Partial<TextState>,
): TextPathLayout {
    const full = withTextDescriptor(state);
    const empty: TextPathLayout = { glyphs: [], bounds: { left: 0, top: 0, right: 0, bottom: 0 } };

    if (full.text.length === 0 || full.path == null) return empty;

    // Autofit has no meaning on a path (no box to fit); use a fixed fallback size
    // like the segmented path does, so the text still shapes.
    const fontSize = full.fontSize === 'autofit' ? 100 : full.fontSize;

    const run = shapeTextRun(canvasKit, fontMgr, full, fontSize);
    if (!run) return empty;

    return mapRunToPath(run, full.path, full.align);
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
