// Figma-style mask modes for a MaskGroup.
// `alpha`     — use mask's rendered alpha (default)
// `vector`    — fast path-only clip (uses canvas clipPath under the hood)
// `luminance` — use mask's luminance as alpha
export type MaskMode = "alpha" | "vector" | "luminance";

// Which paint layers the mask is applied to. Unlisted layers render above the
// masked composite (as if drawn after endMask). Omit to mask all layers (default).
// Example: apply: 'fill' — fills are masked, strokes/shadows render on top.
export type MaskApplyLayer = "fill" | "stroke";
export type MaskApply = MaskApplyLayer | MaskApplyLayer[];

export interface MaskOptions {
    mode?: MaskMode;
    // When true, content shows where the mask is NOT (subtract / inverse mask).
    inverted?: boolean;
    // Which paint layers the mask applies to (default: all).
    apply?: MaskApply;
}