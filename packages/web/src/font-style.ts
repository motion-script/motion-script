import type { CanvasKit, FontStyle, Typeface, TypefaceFontProvider } from "@motion-script/canvaskit";

/**
 * Build a CanvasKit {@link FontStyle} from a numeric CSS font weight (100–900)
 * and an optional italic flag. Skia's font matcher reads the `weight`/`slant`
 * fields off this style and picks the closest registered typeface for the
 * family — this is what makes any `fontWeight` resolve to the nearest available
 * weight file rather than requiring an exact `family@weight` registration.
 */
export function toFontStyle(canvasKit: CanvasKit, fontWeight: number, italic = false): FontStyle {
    // FontWeight enum entities carry their numeric CSS weight as `.value`, so a
    // raw numeric weight can be passed straight through. We still clamp to the
    // valid CSS range so an out-of-range tween value can't confuse the matcher.
    const weight = { value: Math.max(1, Math.min(1000, Math.round(fontWeight))) } as FontStyle["weight"];
    return {
        weight,
        slant: italic ? canvasKit.FontSlant.Italic : canvasKit.FontSlant.Upright,
        width: canvasKit.FontWidth.Normal,
    };
}

/**
 * Resolve the closest registered typeface for a family at the requested weight
 * and slant. Fonts are registered under their bare family name (see
 * {@link WebStorageAdapter.loadFont}), so the provider holds every weight of a
 * family and Skia selects the nearest *static* file match.
 *
 * Note: this matcher does NOT instantiate a variable font's `wght` axis — it
 * returns the default instance regardless of requested weight. Paragraph text
 * gets continuous variable weight through the layout path instead (which passes
 * `fontVariations` and draws with the run's positioned typeface); see
 * {@link layoutParagraph}. This helper remains for static-family matching.
 */
export function resolveTypeface(
    canvasKit: CanvasKit,
    fontMgr: TypefaceFontProvider,
    fontFamily: string,
    fontWeight: number,
    italic = false,
): Typeface | null {
    return fontMgr.matchFamilyStyle(fontFamily, toFontStyle(canvasKit, fontWeight, italic));
}
