import type { Color } from "@/attributes/shape/fill/color/parser";
import type { Passthrough3D } from "./geometry";
import type { Uniform3D } from "./material";
import type { Vector3Input } from "./vector3";

/**
 * Depth haze that fades distant geometry toward a colour.
 *
 * One shape rather than a discriminated pair: setting {@link density} is
 * exponential fog and setting {@link near}/{@link far} is linear, which is what
 * the old `type` field said twice. Writing `type: "exponential"` beside a `far`
 * silently dropped the `far`; there is nothing to get wrong now.
 *
 * `color` is derived from the viewport's own fill when omitted. Fog that does not
 * match what is behind it reads as a grey wall rather than as distance, and the
 * two colours being separately typed by hand is exactly how they drift.
 */
export interface FogData3D {
    color?: Color;
    /** Linear fog: distance at which fog begins. */
    near?: number;
    /** Linear fog: distance at which fog is total. */
    far?: number;
    /** Exponential-squared falloff. Wins over {@link near}/{@link far}. */
    density?: number;
}

/**
 * Image-based lighting, and the sky it comes from.
 *
 * Light and background are one control because they are one physical thing: an
 * HDRI that lights a scene is the same panorama you see behind it, and having
 * them as two nodes meant setting one, wondering why metal was black or why the
 * sky was missing, and setting the other.
 *
 * This is also *all* that is left of the old `Background3D`. A solid colour, a
 * gradient or a flat image behind the scene is a **2D fill** — `Canvas3D` is a
 * `Rect` and already composites its 3D pass over its own fill layers, the
 * renderer already clears transparent, and neither lighting nor fog touches a
 * three background, so the 3D path was doing strictly less than the 2D one it sat
 * in front of. What genuinely needs the 3D pass is a sky that *reprojects* as the
 * camera turns, which is this.
 */
export interface EnvironmentData3D extends Passthrough3D {
    /** A 360° panorama — `.hdr`/`.exr` for real IBL, or a plain image. */
    src?: string;
    /** Six faces, in three's order: +X, −X, +Y, −Y, +Z, −Z. */
    faces?: readonly string[];
    /** A built-in studio interior. Needs no asset — the fastest way to good metal. */
    preset?: "studio";
    /** Multiplies the light received. Default 1. */
    intensity?: number;
    /** Rotate the panorama, in **degrees**. */
    rotation?: Vector3Input;
    /** Also draw it behind the scene, as an infinitely distant sky. */
    background?: boolean;
    /** Blur applied to the background only, 0–1. Leaves the lighting sharp. */
    blur?: number;
}

/**
 * Scene-wide shadow settings.
 *
 * `quality` stands in for the map resolution and the filter three exposes
 * separately (`pcf`, `pcfSoft`, `vsm`, `mapSize`): those two are chosen together
 * in practice, and neither is a design decision. Individual lights soften their
 * own shadow; objects opt out with `shadow={false}`.
 *
 * Enabling shadows recompiles every material that receives them, so treat this as
 * setup rather than something to animate.
 */
export interface ShadowSettings3D {
    enabled?: boolean;
    /** Default `"medium"`. */
    quality?: "low" | "medium" | "high";
}

/** Shadows as written on a viewport: a switch, or the settings. */
export type Shadows3D = boolean | ShadowSettings3D;

/** Normalize a viewport's `shadows` prop. */
export function resolveShadows3D(value: Shadows3D | undefined): ShadowSettings3D | null {
    if (value === undefined || value === false) return null;
    if (value === true) return { enabled: true };
    return { enabled: true, ...value };
}

/**
 * How high-dynamic-range colour is mapped into displayable range.
 *
 * `"aces"` is the filmic default most renderers use and handles bright
 * highlights gracefully; `"none"` clips them. Materials opt out individually with
 * `toneMapped: false` — useful for UI-like overlays that must keep an exact colour.
 */
export type ToneMapping3D =
    | "none"
    | "linear"
    | "reinhard"
    | "cineon"
    | "aces"
    | "agx"
    | "neutral";

/** Tone mapping and exposure, as a viewport carries them. */
export interface ToneSettings3D {
    mapping?: ToneMapping3D;
    /** Stops of exposure applied before mapping. Default 1. */
    exposure?: number;
}

/**
 * A full-frame post-processing pass, applied after the scene renders.
 *
 * Deliberately short, because most of what used to be here is a 2D effect. A
 * `Canvas3D` is a `Node2D`, so it already carries the whole `effects` chain —
 * vignette, grain, colour grading, blur, chromatic aberration and the rest run
 * over the composited result with no 3D pass involved, and post-process
 * antialiasing is what the viewport's own `antialias` already does with MSAA.
 *
 * What is left are the passes that genuinely need what only the 3D pass has:
 * `ssao` and `dof` read the depth buffer, `outline` reads object ids, and `bloom`
 * reads **HDR radiance before tone mapping** — which is why an emissive surface
 * blooms here and merely brightens under the 2D chain. `shaderPass` stays as the
 * escape hatch for a pass that needs to sit inside the 3D composite.
 *
 * Post-processing forces the render through an offscreen target, so a scene with
 * any of these costs more than one without, even for a cheap effect.
 */
export type PostEffect3D =
    /** Bleeds light from bright pixels, in HDR. What makes `emission` actually glow. */
    | ({ type: "bloom"; strength?: number; radius?: number; threshold?: number } & Passthrough3D)
    /** Contact shadows in creases, from screen-space geometry. */
    | ({ type: "ssao"; radius?: number; intensity?: number } & Passthrough3D)
    | ({ type: "outline"; color?: Color; thickness?: number } & Passthrough3D)
    /** Depth of field. `focus` is the sharp distance, `aperture` the blur strength. */
    | ({ type: "dof"; focus?: number; aperture?: number; maxBlur?: number } & Passthrough3D)
    /** Anything expressible as one fragment pass inside the 3D composite. */
    | ({ type: "shaderPass"; fragment: string; uniforms?: Readonly<Record<string, Uniform3D>> } & Passthrough3D);
