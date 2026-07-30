import { lerpNumber } from "@/tween/lerp";
import { lerpVector2, type Vector2 } from "@/attributes/layout/vector2";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * How the wave's crests are laid out.
 *
 * - `"linear"` — parallel crests running across the node, travelling along
 *   `angle`. Flags, banners, wobbling type, heat shimmer.
 * - `"radial"` — concentric rings expanding from `center`. The pond-ripple /
 *   drop-impact look, and the one that reads as *something happened here*.
 */
export type WaveShape = "linear" | "radial";

/**
 * Sine displacement — the procedural warp that needs no asset.
 *
 * Pixels are resampled at a position offset by a sine of their own coordinate,
 * so the content ripples without anything being generated or loaded. For an
 * arbitrary warp driven by an image, see `displace`.
 *
 * `phase` is in degrees and the sine wraps, so a **linear tween of `phase` over
 * 360 loops seamlessly** — that is how you make the wave travel. Animating it is
 * the whole point; a static wave reads as a distortion rather than as motion.
 */
export interface WaveEffect extends ModedEffect {
    type: "wave";
    /** Peak displacement in px per axis. `{ x: 0, y: 20 }` ripples vertically only. */
    amplitude: Vector2;
    /** Distance between crests in px. */
    wavelength: number;
    /** Phase offset in degrees. Tween it over 360 for one seamless loop. */
    phase: number;
    /** Crest layout — parallel bands or concentric rings. */
    shape: WaveShape;
    /** Direction the crests advance along, in degrees. `"linear"` only. */
    angle: number;
    /** Ring origin in 0–1 layer coords. `"radial"` only. */
    center: Vector2;
}

export const waveEffect: EffectData<WaveEffect> = {
    lerp: (from, to, t) => ({
        type: "wave",
        amplitude: lerpVector2(from.amplitude, to.amplitude, t),
        wavelength: lerpNumber(from.wavelength, to.wavelength, t),
        phase: lerpNumber(from.phase, to.phase, t),
        shape: t < 0.5 ? from.shape : to.shape,
        angle: lerpNumber(from.angle, to.angle, t),
        center: lerpVector2(from.center, to.center, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.amplitude.x === b.amplitude.x &&
        a.amplitude.y === b.amplitude.y &&
        a.wavelength === b.wavelength &&
        a.phase === b.phase &&
        a.shape === b.shape &&
        a.angle === b.angle &&
        a.center.x === b.center.x &&
        a.center.y === b.center.y &&
        a.mode === b.mode,
    // Resamples the source at an offset position.
    surface: "shader",
};
