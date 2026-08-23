import type { Color } from "@/attributes/shape/fill/color/parser";
import type { Passthrough3D } from "./geometry";
import type { Uniform3D } from "./material";
import type { Texture3D } from "./texture";
import type { Vector3Input } from "./vector3";

/** Depth haze that fades distant geometry toward a colour. */
export type FogData3D =
    /** Fades linearly between `near` and `far`. Predictable and easy to tune. */
    | { type: "linear"; color?: Color; near?: number; far?: number }
    /** Exponential-squared falloff. More natural, controlled by one `density`. */
    | { type: "exponential"; color?: Color; density?: number };

/**
 * What fills the pixels no geometry covers.
 *
 * Defaults to `"transparent"` — the whole point of compositing 3D into a 2D
 * scene is that the 2D content behind it shows through, so an opaque background
 * is opt-in. A bare {@link Color} is sugar for a solid clear colour.
 */
export type BackgroundData3D =
    | Color
    | { type: "color"; color: Color }
    /** A flat image, stretched across the frame. */
    | { type: "texture"; texture: Texture3D }
    /** Six faces, in three's order: +X, -X, +Y, -Y, +Z, -Z. */
    | { type: "cubemap"; faces: readonly [Texture3D, Texture3D, Texture3D, Texture3D, Texture3D, Texture3D] }
    /** A 360° panorama. The usual form for a photographic sky. */
    | { type: "equirect"; texture: Texture3D; blurriness?: number; intensity?: number }
    /** Let the 2D scene behind show through. The default. */
    | { type: "transparent" };

/**
 * Image-based lighting — light the scene *with* an environment rather than with
 * discrete lights. This is what makes `standard`/`physical` metals read as metal;
 * without it a metallic surface has nothing to reflect and looks black.
 */
export type EnvironmentData3D =
    /** A 360° HDR panorama. Needs a loader for `.hdr`/`.exr`. */
    | { type: "equirect"; src: string; intensity?: number; rotation?: Vector3Input }
    | { type: "cubemap"; faces: readonly string[] }
    /** A built-in studio interior. Needs no asset — the fastest way to good metal. */
    | { type: "room"; intensity?: number };

/** How shadow maps are filtered scene-wide. */
export type ShadowType3D = "basic" | "pcf" | "pcfSoft" | "vsm";

/**
 * Scene-wide shadow settings.
 *
 * Enabling shadows recompiles every material that receives them, so treat this as
 * setup rather than something to animate. Individual lights opt in with their own
 * `shadow` field plus `castShadow`/`receiveShadow` on the objects.
 */
export interface ShadowSettingsData3D {
    enabled?: boolean;
    /** Default `"pcfSoft"` — soft edges at a modest cost. */
    type?: ShadowType3D;
    /** Default shadow-map resolution for lights that don't set their own. */
    mapSize?: number;
}

/** How high-dynamic-range colour is mapped into displayable range. */
export type ToneMappingMode3D =
    | "none"
    | "linear"
    | "reinhard"
    | "cineon"
    | "aces"
    | "agx"
    | "neutral";

/**
 * Tone mapping and exposure.
 *
 * `"aces"` is the filmic default most renderers use and handles bright
 * highlights gracefully; `"none"` clips them. Materials can opt out per-material
 * with `toneMapped: false` — useful for UI-like overlays that must keep an exact
 * colour.
 */
export interface ToneMappingData3D {
    mapping?: ToneMappingMode3D;
    /** Stops of exposure applied before mapping. Default 1. */
    exposure?: number;
}

/**
 * A full-frame post-processing pass, applied after the scene renders.
 *
 * These run in the order given. Note that post-processing forces the render
 * through an offscreen target, which changes the compositing path — so a scene
 * with post effects costs more than one without, even for a cheap effect.
 */
export type PostEffectData3D =
    /** Bleeds light from bright pixels. What makes `emissive` actually glow. */
    | ({ type: "bloom"; strength?: number; radius?: number; threshold?: number } & Passthrough3D)
    /** Contact shadows in creases from screen-space geometry. */
    | ({ type: "ssao"; radius?: number; intensity?: number } & Passthrough3D)
    | ({ type: "outline"; color?: Color; thickness?: number } & Passthrough3D)
    /** Depth of field. `focus` is the sharp distance, `aperture` the blur strength. */
    | ({ type: "dof"; focus?: number; aperture?: number; maxBlur?: number } & Passthrough3D)
    /** Post-process antialiasing, for when MSAA isn't available or enough. */
    | ({ type: "fxaa" } & Passthrough3D)
    | ({ type: "smaa" } & Passthrough3D)
    /** Vignette, grain, colour grading — anything expressible as one fragment pass. */
    | ({ type: "shaderPass"; fragment: string; uniforms?: Readonly<Record<string, Uniform3D>> } & Passthrough3D);
