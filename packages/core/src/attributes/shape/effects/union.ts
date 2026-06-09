import type { BlurEffect } from "./implementations/blur";
import type { BackgroundBlurEffect } from "./implementations/background-blur";
import type { GrayScaleEffect } from "./implementations/grayscale";
import type { PixelateEffect } from "./implementations/pixelate";
import type { TextureEffect } from "./implementations/texture";
import type { BulgeEffect } from "./implementations/bulge";
import type { ZoomEffect } from "./implementations/zoom";
import type { BloomEffect } from "./implementations/bloom";
import type { VintageEffect } from "./implementations/vintage";
import type { ChromaticAberrationEffect } from "./implementations/chromatic-aberration";
import type { SkSLEffect } from "./implementations/sksl";

/** Discriminated union of every effect type a scene node can carry. */
export type SceneEffect =
    | BlurEffect
    | BackgroundBlurEffect
    | GrayScaleEffect
    | PixelateEffect
    | TextureEffect
    | BulgeEffect
    | ZoomEffect
    | BloomEffect
    | VintageEffect
    | ChromaticAberrationEffect
    | SkSLEffect;
