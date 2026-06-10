import type { BlurEffect } from "./implementations/blur";
import type { DirectionalBlurEffect } from "./implementations/directional-blur";
import type { BackgroundBlurEffect } from "./implementations/background-blur";
import type { GrayScaleEffect } from "./implementations/grayscale";
import type { PixelateEffect } from "./implementations/pixelate";
import type { BulgeEffect } from "./implementations/bulge";
import type { MagnifyEffect } from "./implementations/magnify";
import type { BloomEffect } from "./implementations/bloom";
import type { VintageEffect } from "./implementations/vintage";
import type { ChromaticAberrationEffect } from "./implementations/chromatic-aberration";
import type { InvertEffect } from "./implementations/invert";
import type { ScatterEffect } from "./implementations/scatter";
import type { SkSLEffect } from "./implementations/sksl";

/** Discriminated union of every effect type a scene node can carry. */
export type SceneEffect =
    | BlurEffect
    | DirectionalBlurEffect
    | BackgroundBlurEffect
    | GrayScaleEffect
    | PixelateEffect
    | BulgeEffect
    | MagnifyEffect
    | BloomEffect
    | VintageEffect
    | ChromaticAberrationEffect
    | InvertEffect
    | ScatterEffect
    | SkSLEffect;
