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
import type { AsciiEffect } from "./implementations/ascii";
import type { StreakEffect } from "./implementations/streak";
import type { GodRaysEffect } from "./implementations/god-rays";
import type { OilPaintEffect } from "./implementations/oil-paint";
import type { TextureEffect } from "./implementations/texture";
import type { DisplaceEffect } from "./implementations/displace";
import type { WaveEffect } from "./implementations/wave";
import type { TwirlEffect } from "./implementations/twirl";
import type { ProgressiveBlurEffect } from "./implementations/progressive-blur";
import type { KaleidoscopeEffect } from "./implementations/kaleidoscope";
import type { TrailsEffect } from "./implementations/trails";
import type { GlassEffect } from "./implementations/glass";

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
    | BitCrushEffect
    | AsciiEffect
    | StreakEffect
    | GodRaysEffect
    | OilPaintEffect
    | TextureEffect
    | DisplaceEffect
    | WaveEffect
    | TwirlEffect
    | ProgressiveBlurEffect
    | KaleidoscopeEffect
    | TrailsEffect
    | GlassEffect;
