import { createContext } from "@/util/context";
import { Fill } from "@/attributes/shape/fill/chain";
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
 * Apply inherited {@link TextStyleToken} defaults to a text node, for each style
 * key the author didn't pass. Shared by `Text` and `RichText`'s `init`.
 *
 * Assignment goes through the node's property setter, which runs the field's
 * registered mapper (so an inherited `fill: 'red'` is resolved exactly as if the
 * author had written it). `props` is the node's own constructor props — a key
 * present there means the author set it explicitly and must not be overridden.
 */
export function applyTextDefaults(node: Node, props?: Record<string, unknown>): void {
    const defaults = node.useContext(TextStyleToken);
    const target = node as unknown as Record<string, unknown>;
    for (const key of TEXT_STYLE_KEYS) {
        if (props && props[key] !== undefined) continue; // author wins
        const value = defaults[key as keyof TextDefaults];
        if (value === undefined) continue;               // no provider set it
        target[key] = value;
    }
}
