import { createContext } from "@/util/context";
import { Fill } from "@/attributes/shape/fill/chain";
import { getTypographyPreset } from "@/attributes/shape/fill/color/parser";
import { TextAlign } from "@/attributes/text/align";
import { FontStyle } from "@/attributes/text/span";
import type { Node } from "@/nodes/base/node";

/**
 * Built-in context tokens. These are ordinary {@link createContext} tokens —
 * the same primitive authors use for their own data — so the theme/text-style/
 * seed channels and user-defined context all travel one uniform path down the
 * node tree.
 */

/**
 * Text-style defaults contributed by a `<DefaultTextStyle>`. Each field is the
 * loose author-facing type (matching the corresponding `Text` `@property`), and
 * is optional: only the keys a `DefaultTextStyle` explicitly sets are present,
 * so a descendant `Text` inherits exactly those and keeps its own defaults for
 * the rest.
 */
export interface TextDefaults {
    fontFamily?: string;
    fontSize?: number | 'autofit';
    fontWeight?: number;
    fontStyle?: FontStyle;
    letterSpacing?: number;
    lineHeight?: number;
    textAlign?: TextAlign;
    fill?: Fill;
}

/** The `Text` style props a `DefaultTextStyle` can supply and a `Text`/`RichText`
 * inherits. Iterated by both the provider (to collect) and the consumer (to
 * apply), so the two stay in lockstep. */
export const TEXT_STYLE_KEYS = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
    'letterSpacing', 'lineHeight', 'textAlign', 'fill',
] as const satisfies readonly (keyof TextDefaults)[];

/** Inherited text-style defaults (set by `<DefaultTextStyle>`). */
export const TextStyleToken = createContext<TextDefaults>({}, "text-style");

/** Inherited theme map (set by `<ThemeProvider theme={…}>`). */
export const ThemeToken = createContext<Record<string, unknown>>({}, "theme");

/** Arbitrary inherited data bag (set by `<ThemeProvider data={…}>`). */
export const DataToken = createContext<Record<string, unknown>>({}, "data");

/** Inherited default seed (set by `<ThemeProvider seed={…}>`). Consumed by
 * author code today; a follow-up wires it into per-node randomness. */
export const SeedToken = createContext<string | number | undefined>(undefined, "seed");

/**
 * Apply text-style defaults to a text node, for each style key the author didn't
 * pass explicitly. Shared by `Text` and `RichText`'s `init`.
 *
 * Precedence per key, highest to lowest:
 *   1. explicit author prop (present in `props`) — never overridden;
 *   2. the node's `variant` typography preset, from `theme.typography` (registered
 *      by {@link setTheme}, looked up via {@link getTypographyPreset});
 *   3. the inherited {@link TextStyleToken} default from an ancestor
 *      `<DefaultTextStyle>`;
 *   (4. the node's own `@property` default — already applied by the constructor.)
 *
 * Assignment goes through the node's property setter, which runs the field's
 * registered mapper (so a preset/inherited `fill: 'brand-500'` is resolved
 * exactly as if the author had written it). `props` is the node's own
 * constructor props.
 */
export function applyTextDefaults(node: Node, props?: Record<string, unknown>): void {
    const inherited = node.useContext(TextStyleToken);
    const variant = props?.variant as string | undefined;
    const preset = variant ? getTypographyPreset(variant) : undefined;
    const target = node as unknown as Record<string, unknown>;
    for (const key of TEXT_STYLE_KEYS) {
        if (props && props[key] !== undefined) continue;        // 1. author wins
        const fromVariant = preset ? preset[key] : undefined;   // 2. variant preset
        const value = fromVariant !== undefined
            ? fromVariant
            : inherited[key as keyof TextDefaults];             // 3. inherited default
        if (value === undefined) continue;                      // nothing set it
        target[key] = value;
    }
}
