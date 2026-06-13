/** Effect data types for each built-in effect. */
export type { BlurEffect } from "./implementations/blur";
export type { DirectionalBlurEffect } from "./implementations/directional-blur";
export type { GrayScaleEffect } from "./implementations/grayscale";
export type { PixelateEffect } from "./implementations/pixelate";
export type { BulgeEffect } from "./implementations/bulge";
export type { MagnifyEffect } from "./implementations/magnify";
export type { BloomEffect } from "./implementations/bloom";
export type { VintageEffect } from "./implementations/vintage";
export type { ChromaticAberrationEffect } from "./implementations/chromatic-aberration";
export type { InvertEffect, InvertChannel } from "./implementations/invert";
export type { ScatterEffect, ScatterDirection } from "./implementations/scatter";
export type { PosterizeEffect } from "./implementations/posterize";
export type { MotionBlurEffect, MotionBlurAxis } from "./implementations/motion-blur";
export { resolveMotionBlurAxis, resolveMotionBlurAlignment } from "./implementations/motion-blur";
export type { SkSLEffect, SkSLUniform, SkSLUniformValue } from "./implementations/sksl";

/** Chainable effect builder API, chain class, and union input type. */
export { FX, ChainableFx, EffectChain } from './chain';
export type { PixelateOptions, BackdropOptions } from './chain';

export type { EffectData, BackdropCapable } from './effect-data';
export { lerpEffect, lerpEffectArray } from './registry';

/** Union of all concrete effect types accepted by scene nodes. */
export { SceneEffect } from './union';