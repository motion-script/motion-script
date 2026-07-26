import type { BlurEffect } from "./implementations/blur";
import type { DirectionalBlurEffect } from "./implementations/directional-blur";
import type { GrayscaleEffect } from "./implementations/grayscale";
import type { PixelateEffect } from "./implementations/pixelate";
import type { BulgeEffect } from "./implementations/bulge";
import type { MagnifyEffect } from "./implementations/magnify";
import type { BloomEffect } from "./implementations/bloom";
import type { VintageEffect } from "./implementations/vintage";
import type { ChromaticAberrationEffect } from "./implementations/chromatic-aberration";
import type { InvertEffect } from "./implementations/invert";
import type { ScatterEffect } from "./implementations/scatter";
import type { PosterizeEffect } from "./implementations/posterize";
import type { MotionBlurEffect } from "./implementations/motion-blur";
import type { SkSLEffect } from "./implementations/sksl";
import type { OutlineEffect } from "./implementations/outline";
import type { VignetteEffect } from "./implementations/vignette";
import type { GrainEffect } from "./implementations/grain";
import type { SharpenEffect } from "./implementations/sharpen";
import type { EdgesEffect } from "./implementations/edges";
import type { ThresholdEffect } from "./implementations/threshold";
import type { RadialBlurEffect } from "./implementations/radial-blur";
import type { HalftoneEffect } from "./implementations/halftone";
import type { DitherEffect } from "./implementations/dither";
import type { DuotoneEffect } from "./implementations/duotone";
import type { CurvesEffect } from "./implementations/curves";
import type { ColorAdjustmentEffect } from "./implementations/color-adjustment";
import type { RgbShiftEffect } from "./implementations/rgb-shift";
import type { ScanlinesEffect } from "./implementations/scanlines";
import type { BlockDisplaceEffect } from "./implementations/block-displace";
import type { BitCrushEffect } from "./implementations/bit-crush";

/** Discriminated union of every effect type a scene node can carry. */
export type SceneEffect =
    | BlurEffect
    | DirectionalBlurEffect
    | GrayscaleEffect
    | PixelateEffect
    | BulgeEffect
    | MagnifyEffect
    | BloomEffect
    | VintageEffect
    | ChromaticAberrationEffect
    | InvertEffect
    | ScatterEffect
    | PosterizeEffect
    | MotionBlurEffect
    | SkSLEffect
    | OutlineEffect
    | VignetteEffect
    | GrainEffect
    | SharpenEffect
    | EdgesEffect
    | ThresholdEffect
    | RadialBlurEffect
    | HalftoneEffect
    | DitherEffect
    | DuotoneEffect
    | CurvesEffect
    | ColorAdjustmentEffect
    | RgbShiftEffect
    | ScanlinesEffect
    | BlockDisplaceEffect
    | BitCrushEffect;
