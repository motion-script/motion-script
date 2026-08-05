/** Fully resolved per-side edge insets. */
export interface InsetsResolved {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/** Shorthand for equal horizontal (left+right) or vertical (top+bottom) insets. */
export interface SymmetricInsets {
    horizontal: number;
    vertical: number;
}

/**
 * User-facing edge-inset input. Accepts:
 * - a single number (uniform on all sides)
 * - per-side values (`left`, `right`, `top`, `bottom`)
 * - symmetric shorthands (`horizontal`, `vertical`)
 * Mixed forms are allowed; specific sides take precedence over shorthands.
 */
export type InsetsProps = number | Partial<InsetsResolved> & Partial<SymmetricInsets>;

/**
 * Accepted shapes for a four-sided inset prop.
 *
 * The type is named for the shape (four edge insets), not for one use of it:
 * `Node.padding` insets a layout box in pixels, an image fill's `crop` insets a
 * source in fractions. Same value, same shorthands, same tween — different roles,
 * and each prop names its own.
 *
 * Mirrors {@link Fill}: the loose author-facing {@link InsetsProps} (a number or
 * per-side/symmetric object) plus the strict {@link InsetsResolved} — a read-back
 * resolved value structurally satisfies `InsetsProps`, so it passes through
 * {@link resolveInsets} idempotently and can be assigned straight back.
 *
 *   node.padding = 3                          // uniform
 *   node.padding = { horizontal: 8, top: 4 }  // mixed
 *   node.padding = otherNode.padding          // resolved passes through
 */
export type Insets = InsetsProps | InsetsResolved;

/**
 * Resolves an {@link InsetsProps} input to a fully specified {@link InsetsResolved}.
 * Resolution order per side: explicit side value → symmetric shorthand → `previous` fallback → 0.
 */
export function resolveInsets(value: InsetsProps, previous?: InsetsResolved): InsetsResolved {
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
