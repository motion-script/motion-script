import { createContext } from "@/util/context";
import { Fill } from "@/attributes/shape/fill/chain";
import { getTypographyPreset } from "@/attributes/shape/fill/color/parser";
import { TextAlign } from "@/attributes/text/align";
import { FontStyle } from "@/attributes/text/span";
import { type Stroke } from "@/attributes/shape/stroke/mapper";
import { type Shadow } from "@/attributes/shape/shadow/resolver";
import type { Node } from "@/nodes/base/node";

/**
 * Built-in context tokens. These are ordinary {@link createContext} tokens —
 * the same primitive authors use for their own data — so the theme/text-style/
 * seed channels and user-defined context all travel one uniform path down the
 * node tree.
 */

/**
 * A text node's style vocabulary — every field a `<DefaultTextStyle>` can
 * supply, a `Text`/`RichText` `variant` preset can set, and `theme.typography`
 * can default. Each field is the loose author-facing type (matching the
 * corresponding `Text` `@property`) and is optional: only the keys a given
 * source explicitly sets are present, so a descendant inherits exactly those
 * and keeps its own defaults for the rest.
 */
export interface TextStyle {
    fontFamily?: string;
    fontSize?: number | 'autofit';
    fontWeight?: number;
    fontStyle?: FontStyle;
    letterSpacing?: number;
    lineHeight?: number;
    textAlign?: TextAlign;
    fill?: Fill;
    stroke?: Stroke;
    shadow?: Shadow;
}

/** The `Text` style props a `DefaultTextStyle` can supply and a `Text`/`RichText`
 * inherits. Iterated by both the provider (to collect) and the consumer (to
 * apply), so the two stay in lockstep. */
export const TEXT_STYLE_KEYS = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
    'letterSpacing', 'lineHeight', 'textAlign', 'fill', 'stroke', 'shadow',
] as const satisfies readonly (keyof TextStyle)[];

/**
 * The subset of {@link TEXT_STYLE_KEYS} describing how text is *shaped* rather
 * than how it is *painted* — the keys a raw `Graphics` `text`/`richText` op can
 * inherit from {@link RenderContext.defaultTextStyle}.
 *
 * `fill`/`stroke`/`shadow` are deliberately absent. In a `Graphics` those are
 * separate, **group-scoped** ops: `.text(…).rect(…).fill('red')` paints both
 * shapes with one fill, and a shape with no paint op after it draws nothing at
 * all. There is no per-shape paint slot to default into, and synthesising a
 * `fill` op for a text op would silently change which shapes the group's paint
 * covers. A `Text`/`RichText` *node* still inherits all ten keys, through the
 * context channel ({@link applyTextDefaults}), because it owns its own paint.
 */
export const TEXT_SHAPING_KEYS = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
    'letterSpacing', 'lineHeight', 'textAlign',
] as const satisfies readonly (typeof TEXT_STYLE_KEYS)[number][];

/** One of {@link TEXT_SHAPING_KEYS}. */
export type TextShapingKey = (typeof TEXT_SHAPING_KEYS)[number];

/** The resting value of a text-style scope that sets nothing. Frozen and shared
 * so the "no defaults" case allocates nothing per frame. */
export const EMPTY_TEXT_STYLE: TextStyle = Object.freeze({});

/**
 * The project-wide base text style — `theme.typography.default`, registered by
 * {@link setTheme} — as a {@link TextStyle}.
 *
 * The bottom of {@link RenderContext}'s text-style stack, which is what keeps a
 * drawn `text` op and a `Text` node agreeing on the project's base typography:
 * it is the same preset {@link applyTextDefaults} applies as its lowest-priority
 * source (step 4). Read per lookup rather than cached, so a `setTheme` between
 * frames takes effect without any invalidation step.
 */
export function themeDefaultTextStyle(): TextStyle {
    return (getTypographyPreset('default') as TextStyle | undefined) ?? EMPTY_TEXT_STYLE;
}

/** Inherited text-style defaults (set by `<DefaultTextStyle>`). */
export const TextStyleToken = createContext<TextStyle>({}, "text-style");

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
 *   4. the theme's `default` typography preset (`theme.typography.default`) —
 *      a project-wide base style applied with no `variant` or `<DefaultTextStyle>`
 *      required;
 *   (5. the node's own `@property` default — already applied by the constructor.)
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
    const defaultPreset = getTypographyPreset('default');
    const target = node as unknown as Record<string, unknown>;
    for (const key of TEXT_STYLE_KEYS) {
        if (props && props[key] !== undefined) continue;        // 1. author wins
        const fromVariant = preset ? preset[key] : undefined;   // 2. variant preset
        const fromInherited = inherited[key as keyof TextStyle]; // 3. inherited default
        const value = fromVariant !== undefined
            ? fromVariant
            : fromInherited !== undefined
                ? fromInherited
                : defaultPreset?.[key];                          // 4. theme default preset
        if (value === undefined) continue;                      // nothing set it
        target[key] = value;
    }
}
