/**
 * Blend mode definitions.
 *
 * Mirrors the CSS `mix-blend-mode` keyword set. The renderer maps each string
 * to an integer hash for fast uniform uploads.
 */

/** Every supported blend mode, in hash-index order. */
export const BlendModes = [
    "multiply",
    "screen",
    "overlay",
    "darken",
    "lighten",
    "color-dodge",
    "color-burn",
    "hard-light",
    "soft-light",
    "difference",
    "exclusion",
    "hue",
    "saturation",
    "color",
    "luminosity",
    "normal"
] as const;

/** CSS `mix-blend-mode` keyword — derived from {@link BlendModes}. */
export type BlendMode = typeof BlendModes[number];

// Pre-built reverse lookup so getBlendModeHash is O(1).
const BLEND_MODE_HASH: Record<BlendMode, number> =
    Object.fromEntries(
        BlendModes.map((mode, i) => [mode, i])
    ) as Record<BlendMode, number>;

/** Returns the integer hash for a blend mode, used as a shader uniform. */
export function getBlendModeHash(blend: BlendMode): number {
    return BLEND_MODE_HASH[blend];
}
