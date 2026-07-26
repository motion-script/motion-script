/** Effect data types for each built-in effect. */
export type { BlurEffect } from "./implementations/blur";
export type { DirectionalBlurEffect } from "./implementations/directional-blur";
export type { GrayscaleEffect } from "./implementations/grayscale";
export type { PixelateEffect } from "./implementations/pixelate";
export type { BulgeEffect } from "./implementations/bulge";
export type { MagnifyEffect } from "./implementations/magnify";
export type { BloomEffect } from "./implementations/bloom";
export type { VintageEffect } from "./implementations/vintage";
export type { ChromaticAberrationEffect } from "./implementations/chromatic-aberration";
export type { InvertEffect, InvertChannel } from "./implementations/invert";
export type { ScatterEffect } from "./implementations/scatter";
export type { PosterizeEffect } from "./implementations/posterize";
export type { MotionBlurEffect, MotionBlurAlignment } from "./implementations/motion-blur";
export { resolveMotionBlurAlignment } from "./implementations/motion-blur";
export type { SkSLEffect, SkSLUniform, SkSLUniformValue } from "./implementations/sksl";
export type { OutlineEffect, OutlinePosition } from "./implementations/outline";
export type { VignetteEffect } from "./implementations/vignette";
export type { GrainEffect } from "./implementations/grain";
export type { SharpenEffect } from "./implementations/sharpen";
export type { EdgesEffect, EdgeKernel } from "./implementations/edges";
export type { ThresholdEffect } from "./implementations/threshold";
export type { RadialBlurEffect, RadialBlurStyle } from "./implementations/radial-blur";
export type { HalftoneEffect, HalftoneShape } from "./implementations/halftone";
export type { DitherEffect, DitherMatrix } from "./implementations/dither";
export type { DuotoneEffect } from "./implementations/duotone";
export type { CurvesEffect } from "./implementations/curves";
export type { ColorAdjustmentEffect } from "./implementations/color-adjustment";
export type { RgbShiftEffect } from "./implementations/rgb-shift";
export type { ScanlinesEffect } from "./implementations/scanlines";
export type { BlockDisplaceEffect } from "./implementations/block-displace";
export type { BitCrushEffect, BitCrushPalette } from "./implementations/bit-crush";

/** Chainable effect builder API, chain class, and union input type. */
export { Effects, FX, EffectChain } from './chain';
export type { Effect } from './chain';

/** Per-effect builder options. Every builder takes exactly one of these. */
export type {
    BlurOptions,
    DirectionalBlurOptions,
    GrayscaleOptions,
    PixelateOptions,
    BulgeOptions,
    MagnifyOptions,
    BloomOptions,
    VintageOptions,
    ChromaticAberrationOptions,
    InvertOptions,
    ScatterOptions,
    PosterizeOptions,
    MotionBlurOptions,
    SkSLOptions,
    OutlineOptions,
    VignetteOptions,
    GrainOptions,
    SharpenOptions,
    EdgesOptions,
    ThresholdOptions,
    RadialBlurOptions,
    HalftoneOptions,
    DitherOptions,
    DuotoneOptions,
    CurvesOptions,
    ColorAdjustmentOptions,
    RgbShiftOptions,
    ScanlinesOptions,
    BlockDisplaceOptions,
    BitCrushOptions,
} from './chain';

export type { EffectData, EffectMode, EffectSurface, EffectAxis, EffectOptions, ModedEffect } from './effect-data';
export { EFFECT_OPTION_KEYS, withEffectOptions, resolveEffectAxis, sameEffectAxis } from './effect-data';
export { resolveEffectColor, sameEffectColor } from './effect-data';
export { lerpEffect, lerpEffectArray, effectSurface } from './registry';

/** Backdrop/foreground classification helpers. */
export { isBackdropEffect, backdropEffects, foregroundShaderEffects } from './backdrop';

/** Union of all concrete effect types accepted by scene nodes. */
export { SceneEffect } from './union';
