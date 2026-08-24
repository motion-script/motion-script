import type { CanvasKit, TypefaceFontProvider } from "@motion-script/canvaskit";
import { layoutParagraph, type ParagraphLayoutResult, type ParagraphSegment } from "./paragraph-layout";
import type { FontStyle, Size2D, TextAlign } from "@motion-script/core";

/** Shared: an empty string has no extent, and no caller mutates the result. */
const ZERO_SIZE: Size2D = { width: 0, height: 0 };

/**
 * Caches the result of shaping a single-segment straight-text run, so the same
 * (text + font + layout) re-renders without re-running CanvasKit's
 * ParagraphBuilder (two layout passes + Font alloc/free) every frame.
 *
 * Why it matters: `ShapeHandler.text()` deliberately bypasses the cross-frame
 * shape cache that path shapes use, so every `.text()` graphics op re-shaped from
 * scratch. The Code node emits one such op *per token per frame*, so a code block
 * re-shaped dozens of tokens at 60fps for the whole animation. The token text and
 * font never change during compare/swap/settle/highlight (only paint alpha and a
 * draw transform do), so the shaped run is stable and cacheable — this is the
 * deferred win flagged in `packages/components/code/src/measure-cache.ts`.
 *
 * The cached glyph positions are laid out at **origin (0,0)** (so they carry only
 * the layout-centring shift `-layoutWidth/2`, `-blockHeight/2`, never the node's
 * per-frame x/y). The draw site applies the node origin with a canvas translate,
 * and the consumer adds the origin to `localBounds` for fill/stroke bounds. That
 * keeps the key independent of the origin, which moves every frame for every
 * token — origin-in-key would never hit.
 *
 * The cache OWNS the `Font` objects in each entry (CanvasKit/WASM heap objects):
 * callers must NOT `.delete()` fonts on cache-backed results, and the cache frees
 * them on LRU eviction and on {@link ParagraphShapeCache.dispose}. Mirrors
 * `GradientShaderCache`.
 */

/** Inputs that fully determine the shaped result, independent of the draw origin. */
export interface ShapeKeyInputs {
    text: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    fontStyle: string;
    letterSpacing: number;
    lineHeight: number;
    textAlign: TextAlign;
    /** Resolved wrap width (Infinity when not wrapping). */
    maxWidth: number;
    /** Box width used for textAlign placement when not wrapping (0 when n/a). */
    boxWidth: number;
}

/** A cached, origin-(0,0) shaped run plus the centred bounds it was laid out with. */
export interface CachedParagraph {
    /** Shaped runs with positions relative to origin (0,0); Fonts owned by the cache. */
    layout: ParagraphLayoutResult;
}

// Field separator for the cache key — a control char (U+0001) that can't appear
// in `text`, a family name, or a textAlign string, so distinct field tuples can't
// collide (e.g. family "A12"+size 3 vs family "A1"+size 23). Built via
// fromCharCode so no literal control byte lives in the source.
const SEP = String.fromCharCode(1);

/**
 * Build the cache key for a shaping request. `fontEpoch` is folded in so that a
 * run shaped before its font family finished registering (and thus shaped with a
 * fallback face) is invalidated the moment a new family registers.
 */
export function shapeKey(inputs: ShapeKeyInputs, fontEpoch: number): string {
    return [
        inputs.text,
        inputs.fontFamily,
        inputs.fontSize,
        inputs.fontWeight,
        inputs.fontStyle,
        inputs.letterSpacing,
        inputs.lineHeight,
        inputs.textAlign,
        inputs.maxWidth,
        inputs.boxWidth,
        fontEpoch,
    ].join(SEP);
}

export class ParagraphShapeCache {
    private map = new Map<string, CachedParagraph>();

    constructor(private readonly limit = 256) {}

    /**
     * Return the cached shaped paragraph for `key`, or build + store it via
     * `build`. Re-inserts on hit so the Map iteration order acts as a simple LRU.
     * The returned `layout` (and its Fonts) is owned by the cache — do not delete
     * its fonts.
     */
    get(key: string, build: () => ParagraphLayoutResult): CachedParagraph {
        const existing = this.map.get(key);
        if (existing) {
            this.map.delete(key);
            this.map.set(key, existing);
            return existing;
        }
        const entry: CachedParagraph = { layout: build() };
        this.map.set(key, entry);
        if (this.map.size > this.limit) {
            const oldest = this.map.keys().next().value as string | undefined;
            if (oldest !== undefined) {
                const evicted = this.map.get(oldest);
                this.map.delete(oldest);
                if (evicted) for (const f of evicted.layout.fonts) f.delete();
            }
        }
        return entry;
    }

    dispose(): void {
        for (const entry of this.map.values()) {
            for (const f of entry.layout.fonts) f.delete();
        }
        this.map.clear();
    }
}

/** Convenience: pull the {@link ShapeKeyInputs} out of a single segment + layout opts. */
export function shapeKeyInputsFor(
    segment: ParagraphSegment,
    textAlign: TextAlign,
    lineHeight: number,
    maxWidth: number,
    boxWidth: number,
): ShapeKeyInputs {
    return {
        text: segment.text,
        fontFamily: segment.fontFamily,
        fontSize: segment.fontSize,
        fontWeight: segment.fontWeight,
        fontStyle: segment.fontStyle,
        letterSpacing: segment.letterSpacing,
        lineHeight,
        textAlign,
        maxWidth,
        boxWidth,
    };
}

// Fixed layout opts both measureText implementations use — width only depends on
// shaping, not textAlign/origin, so these constants give a stable cache key. Kept in
// sync with the (formerly inline) layoutParagraph opts in render-context and
// measurer so a measured string and a measured-then-drawn string can share
// shape passes where their full inputs match.
const MEASURE_ALIGN: TextAlign = 'center';
const MEASURE_LINE_HEIGHT = 1;

/**
 * Size of `text` under the given font, measured through the same paragraph
 * layout used to render (so hug/auto sizing matches the drawn size), but cached
 * in `cache` so a repeated measurement of the same string doesn't re-shape and
 * re-allocate+free Fonts every call. The cached Fonts are owned by `cache`.
 *
 * Both axes, because the shaper produced both: reconstructing a height from
 * `fontSize × lineHeight` disagrees with it as soon as a fallback face or a
 * script with taller glyphs is involved.
 */
export function measureTextCached(
    canvasKit: CanvasKit,
    fontMgr: TypefaceFontProvider,
    cache: ParagraphShapeCache,
    fontEpoch: number,
    text: string,
    fontSize: number,
    fontFamily: string,
    fontWeight: number,
    letterSpacing: number,
    fontStyle: FontStyle,
): Size2D {
    if (text.length === 0) return ZERO_SIZE;
    const segment: ParagraphSegment = { text, fontFamily, fontSize, fontWeight, fontStyle, letterSpacing };
    const key = shapeKey(
        shapeKeyInputsFor(segment, MEASURE_ALIGN, MEASURE_LINE_HEIGHT, Infinity, 0),
        fontEpoch,
    );
    const { layout } = cache.get(key, () => layoutParagraph(canvasKit, fontMgr, [segment], {
        textAlign: MEASURE_ALIGN,
        lineHeight: MEASURE_LINE_HEIGHT,
        maxWidth: Infinity,
        originX: 0,
        originY: 0,
    }));
    return { width: layout.width, height: layout.height };
}
