import type { CanvasKit, BlendMode as CKBlendMode } from "@motion-script/canvaskit";
import type { BlendMode } from "@motion-script/core";

/**
 * Maps a core {@link BlendMode} keyword to its CanvasKit equivalent.
 *
 * `'pass-through'` is intentionally not handled here: it is a node-only,
 * non-isolating signal resolved in `transform()`, never a paint blend mode.
 * `'normal'` (and any unknown value, including a stray `'pass-through'`) maps to
 * `SrcOver`.
 */
export function getCanvasKitBlendMode(canvasKit: CanvasKit, blend: BlendMode): CKBlendMode {
    switch (blend as string) {
        case "multiply": return canvasKit.BlendMode.Multiply;
        case "screen": return canvasKit.BlendMode.Screen;
        case "overlay": return canvasKit.BlendMode.Overlay;
        case "darken": return canvasKit.BlendMode.Darken;
        case "lighten": return canvasKit.BlendMode.Lighten;
        case "color-dodge": return canvasKit.BlendMode.ColorDodge;
        case "color-burn": return canvasKit.BlendMode.ColorBurn;
        case "hard-light": return canvasKit.BlendMode.HardLight;
        case "soft-light": return canvasKit.BlendMode.SoftLight;
        case "difference": return canvasKit.BlendMode.Difference;
        case "exclusion": return canvasKit.BlendMode.Exclusion;
        case "hue": return canvasKit.BlendMode.Hue;
        case "saturation": return canvasKit.BlendMode.Saturation;
        case "color": return canvasKit.BlendMode.Color;
        case "luminosity": return canvasKit.BlendMode.Luminosity;
        case "normal":
        default: return canvasKit.BlendMode.SrcOver;
    }
}
