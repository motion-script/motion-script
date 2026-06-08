/** Fully resolved per-side padding in pixels. */
export interface PaddingResolved {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/** Shorthand for equal horizontal (left+right) or vertical (top+bottom) padding. */
export interface SymmetricPadding {
    horizontal: number;
    vertical: number;
}

/**
 * User-facing padding input. Accepts:
 * - a single number (uniform padding on all sides)
 * - per-side values (`left`, `right`, `top`, `bottom`)
 * - symmetric shorthands (`horizontal`, `vertical`)
 * Mixed forms are allowed; specific sides take precedence over shorthands.
 */
export type PaddingProps = number | Partial<PaddingResolved> & Partial<SymmetricPadding>;

/**
 * Resolves a `PaddingProps` input to a fully specified `PaddingResolved` value.
 * Resolution order per side: explicit side value → symmetric shorthand → `previous` fallback → 0.
 */
export function resolvePadding(value: PaddingProps, previous?: PaddingResolved): PaddingResolved {
    if (typeof value === "number") {
        return { left: value, right: value, top: value, bottom: value };
    }

    // Fallback resolution order: Specific side -> Symmetric shortcut -> Previous fallback -> Default 0
    return {
        left: value.left ?? value.horizontal ?? previous?.left ?? 0,
        right: value.right ?? value.horizontal ?? previous?.right ?? 0,
        top: value.top ?? value.vertical ?? previous?.top ?? 0,
        bottom: value.bottom ?? value.vertical ?? previous?.bottom ?? 0,
    };
}