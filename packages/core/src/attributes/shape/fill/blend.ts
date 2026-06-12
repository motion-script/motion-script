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

/**
 * Blend modes a node/layer can carry. Adds Figma's `pass-through` to the fill
 * {@link BlendMode} set. `pass-through` (the node default) means the layer is
 * *not* isolated: its opacity scales each child/fill's contribution while those
 * children still blend directly against the backdrop. Any other value isolates
 * the node — its children flatten into a group that then blends against the
 * backdrop with the chosen mode. Fills never accept `pass-through`.
 */
export const NodeBlendModes = [...BlendModes, "pass-through"] as const;

/** Layer blend mode — {@link BlendMode} plus `pass-through`. Node-only. */
export type NodeBlendMode = typeof NodeBlendModes[number];

// Pre-built reverse lookup so getBlendModeHash is O(1).
const BLEND_MODE_HASH: Record<BlendMode, number> =
    Object.fromEntries(
        BlendModes.map((mode, i) => [mode, i])
    ) as Record<BlendMode, number>;

/** Returns the integer hash for a blend mode, used as a shader uniform. */
export function getBlendModeHash(blend: BlendMode): number {
    return BLEND_MODE_HASH[blend];
}
