/**
 * CanvasKit-backed implementations of `@motion-script/core`'s effects.
 *
 * One handler interface and one registry cover every effect the renderer knows:
 * scene effects, media filters, and renderer-internal effects alike. Adding an
 * effect is a handler object plus one `EffectRegistry.register` call.
 */
export type { EffectHandler, EffectGeometry, EffectResources, EffectTarget, RenderEffect } from "./handler";
export { EffectRegistry } from "./registry";

export { blurEffectHandler } from "./blur";
export { directionalBlurEffectHandler } from "./directional-blur";
export { grayscaleEffectHandler } from "./grayscale";
export { pixelateEffectHandler } from "./pixelate";
export { bloomEffectHandler } from "./bloom";
export { vintageEffectHandler } from "./vintage";
export { chromaticAberrationEffectHandler } from "./chromatic-aberration";
export { invertEffectHandler } from "./invert";
export { scatterEffectHandler } from "./scatter";
export { bulgeEffectHandler } from "./bulge";
export { magnifyEffectHandler } from "./magnify";
export { posterizeEffectHandler } from "./posterize";
export { outlineEffectHandler } from "./outline";
export { vignetteEffectHandler } from "./vignette";
export { grainEffectHandler } from "./grain";
export { sharpenEffectHandler } from "./sharpen";
export { edgesEffectHandler } from "./edges";
export { thresholdEffectHandler } from "./threshold";
export { radialBlurEffectHandler } from "./radial-blur";
export { halftoneEffectHandler } from "./halftone";
export { ditherEffectHandler } from "./dither";
export { duotoneEffectHandler, duotoneMatrix } from "./duotone";
export { rgbShiftEffectHandler } from "./rgb-shift";
export { scanlinesEffectHandler } from "./scanlines";
export { blockDisplaceEffectHandler } from "./block-displace";
export { bitCrushEffectHandler } from "./bit-crush";
export { asciiEffectHandler } from "./ascii";
export { GlyphAtlasCache, atlasCell, atlasGlyphCount } from "./glyph-atlas";
export type { GlyphAtlas, GlyphAtlasSpec } from "./glyph-atlas";
export { skslEffectHandler } from "./sksl";
export { motionBlurEffectHandler, resolveMotionBlur } from "./motion-blur";
export type { MotionBlurResolved } from "./motion-blur";

export { getOrCompileSkSL, disposeSkSLCache } from "./sksl-cache";
