import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import type { EffectResources } from "./handler";
import { resolveTypeface } from "../font-style";

/**
 * A charset baked into a single-row texture: every glyph drawn white-on-black in
 * its own square cell, ordered darkest to lightest.
 *
 * A shader can then reproduce a glyph by sampling one cell — pick the cell from
 * the local tone, offset within it by the pixel's position in its own cell, and
 * the glyph appears. That is the whole trick behind `ascii`, and it needs no
 * per-glyph work at draw time because the atlas is baked once.
 *
 * White-on-black matters: the sampled value is used directly as coverage, so
 * "ink" is the bright part and the background contributes nothing. Drawing the
 * conventional black-on-white would make every cell read as fully covered.
 */
export interface GlyphAtlas {
    /** Child shader sampling the baked texture. */
    readonly shader: Shader;
    /** Number of cells across, i.e. glyphs in the charset. */
    readonly count: number;
    /** Cell edge in texture px. */
    readonly cell: number;
    /** Free the texture and its shader. */
    dispose(): void;
}

/** Everything a bake depends on — the cache key is derived from exactly this. */
export interface GlyphAtlasSpec {
    /** Glyphs in ramp order, darkest (most ink) first. */
    readonly charset: string;
    /** Family to bake with; falls back to whatever Skia matches if absent. */
    readonly fontFamily: string;
    /** Weight passed to the font matcher. */
    readonly fontWeight: number;
    /** Cell edge in texture px — the resolution each glyph is baked at. */
    readonly cell: number;
}

/** Cell resolution is capped so a huge authored cell can't allocate a huge atlas. */
const MAX_CELL = 64;
/** Charset length cap, for the same reason (atlas width = count × cell). */
const MAX_GLYPHS = 256;

/**
 * The clamps the baker applies, exported so a caller can predict an atlas's
 * dimensions without holding the atlas.
 *
 * A shader needs the glyph count and cell size as uniforms; deriving them from
 * the same two functions the bake uses keeps the two in step, where passing them
 * back out of the cache would be one more thing to thread and get wrong.
 */
export const atlasCell = (requested: number): number =>
    Math.max(4, Math.min(MAX_CELL, Math.round(requested)));

export const atlasGlyphCount = (charset: string): number =>
    Math.min([...charset].length, MAX_GLYPHS);

const keyOf = (spec: GlyphAtlasSpec, fontEpoch: number): string =>
    `${fontEpoch}|${spec.cell}|${spec.fontFamily}|${spec.fontWeight}|${spec.charset}`;

/**
 * Bakes charsets to textures and hands out the results, one bake per distinct
 * {@link GlyphAtlasSpec}.
 *
 * The cache is keyed on the font epoch as well as the spec: a family that
 * finishes loading after the first frame changes what the same spec bakes to,
 * and without the epoch the blank first-frame atlas would be served forever.
 */
export class GlyphAtlasCache {
    private entries = new Map<string, GlyphAtlas | null>();

    /**
     * The atlas for `spec`, baking it if needed. Returns null when the bake
     * failed (no surface, empty charset); the null is cached too, so a failure
     * doesn't retry every frame.
     */
    get(spec: GlyphAtlasSpec, ck: CanvasKit, res: EffectResources): GlyphAtlas | null {
        const key = keyOf(spec, res.fontEpoch);
        const hit = this.entries.get(key);
        if (hit !== undefined) return hit;

        const built = bake(spec, ck, res);
        this.entries.set(key, built);
        return built;
    }

    /** Free every baked atlas. Call from the handler's `dispose`. */
    dispose(): void {
        for (const atlas of this.entries.values()) atlas?.dispose();
        this.entries.clear();
    }
}

/**
 * The requested family, or the first registered one, or Skia's default.
 *
 * The fallback matters more here than it does for text: a scene asking for
 * `'monospace'` has usually registered no such family, and this CanvasKit build
 * ships no built-in fonts — so the default typeface has no glyphs and the atlas
 * bakes *blank*, which the effect can't distinguish from a legitimately empty
 * charset. Falling back to whatever the project did load renders in the wrong
 * face, which is obvious and fixable, rather than rendering nothing at all.
 */
function pickTypeface(spec: GlyphAtlasSpec, ck: CanvasKit, res: EffectResources) {
    const requested = resolveTypeface(ck, res.fontMgr, spec.fontFamily, spec.fontWeight);
    if (requested) return requested;

    if (res.fontMgr.countFamilies() > 0) {
        const first = res.fontMgr.getFamilyName(0);
        const fallback = resolveTypeface(ck, res.fontMgr, first, spec.fontWeight);
        if (fallback) return fallback;
    }
    return null;
}

/** Draw each glyph centred in its cell, white on black, and wrap it in a shader. */
function bake(spec: GlyphAtlasSpec, ck: CanvasKit, res: EffectResources): GlyphAtlas | null {
    const glyphs = [...spec.charset].slice(0, MAX_GLYPHS);
    if (glyphs.length === 0) return null;

    const cell = atlasCell(spec.cell);
    const surface = res.makeSurface(cell * glyphs.length, cell);
    if (!surface) return null;

    const font = new ck.Font(pickTypeface(spec, ck, res), cell * 0.8);
    font.setSubpixel(true);

    const canvas = surface.getCanvas();
    canvas.clear(ck.BLACK);

    const paint = new ck.Paint();
    paint.setColor(ck.WHITE);
    paint.setAntiAlias(true);

    let missing = 0;
    glyphs.forEach((glyph, i) => {
        const ids = font.getGlyphIDs(glyph);
        // Glyph 0 is .notdef — the font has no such character. Skipping it draws
        // an empty cell instead of a tofu box, which at least reads as "lighter"
        // rather than as a rectangle of noise.
        if (ids.length === 0 || ids[0] === 0) {
            missing++;
            return;
        }
        const widths = font.getGlyphWidths(ids);
        const advance = widths[0] ?? cell;
        // Centre horizontally on the advance, and sit the baseline low enough
        // that descenders stay inside the cell.
        const x = i * cell + (cell - advance) / 2;
        const y = cell * 0.78;
        canvas.drawGlyphs(ids, [x, y], 0, 0, font, paint);
    });

    if (missing > 0) {
        // Worth saying out loud: the ramp silently loses steps, and the usual
        // cause is a charset outside Latin (blocks, braille) baked in a font that
        // doesn't cover it.
        console.warn(
            `[motion-script] ascii: ${missing}/${glyphs.length} glyphs are missing from ` +
            `'${spec.fontFamily}'. Register a font covering those characters, or use the ` +
            `'standard' charset, which is plain ASCII.`,
        );
    }

    if (missing === glyphs.length) {
        // Nothing drew — no font is registered at all, or none of the charset
        // exists in the one that is. Reporting failure makes the effect a no-op;
        // handing back the blank atlas would instead paint every cell as
        // background and silently erase the content.
        paint.delete();
        font.delete();
        surface.delete();
        return null;
    }

    paint.delete();
    font.delete();
    surface.flush();

    const image = surface.makeImageSnapshot();
    // Clamp so sampling at a cell's edge doesn't bleed in the neighbouring
    // glyph; linear so glyph edges stay smooth when a cell is scaled.
    const shader = image.makeShaderOptions(
        ck.TileMode.Clamp, ck.TileMode.Clamp, ck.FilterMode.Linear, ck.MipmapMode.None,
    );

    return {
        shader,
        count: glyphs.length,
        cell,
        dispose() {
            shader.delete();
            image.delete();
            surface.delete();
        },
    };
}
