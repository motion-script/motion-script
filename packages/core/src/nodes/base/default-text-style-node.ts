import { Node, NodeConfig, NodeProps } from "./node";
import { property } from "@/attributes/properties/decorator";
import { ContextMap } from "@/util/context";
import { TextStyleToken, TextDefaults, TEXT_STYLE_KEYS } from "@/runtime/builtin-context";
import { Fill } from "@/attributes/shape/fill/chain";
import { TextAlign } from "@/attributes/text/align";
import { FontStyle } from "@/attributes/text/span";

export interface DefaultTextStyleProps extends NodeProps {
    fontFamily: string;
    fontSize: number | 'autofit';
    fontWeight: number;
    fontStyle: FontStyle;
    letterSpacing: number;
    lineHeight: number;
    textAlign: TextAlign;
    fill: Fill;
}

/**
 * Sets default text styling for the {@link Text} / {@link RichText} nodes below
 * it. A descendant inherits each style prop it didn't set itself, from the
 * nearest ancestor `DefaultTextStyle` that did — author-set props always win
 * over inherited ones. Nesting accumulates per key (an inner `fontSize` and an
 * outer `fontFamily` both apply).
 *
 * Built on the same context machinery as {@link Provider}: it contributes the
 * built-in {@link TextStyleToken}, merging only the keys the author explicitly
 * passed onto any ancestor's defaults.
 *
 * It contributes the author's *raw* prop values (not resolved cell values), so
 * each consumer resolves them once through its own mapper — e.g. `fill='red'`
 * is resolved by `Text`'s fill mapper, not pre-resolved here.
 *
 * Layout-transparent like {@link Provider} — carries style, not appearance.
 */
export class DefaultTextStyle extends Node<DefaultTextStyleProps> {
    @property({ default: undefined }) declare readonly fontFamily?: string;
    @property({ default: undefined }) declare readonly fontSize?: number | 'autofit';
    @property({ default: undefined }) declare readonly fontWeight?: number;
    @property({ default: undefined }) declare readonly fontStyle?: FontStyle;
    @property({ default: undefined }) declare readonly letterSpacing?: number;
    @property({ default: undefined }) declare readonly lineHeight?: number;
    @property({ default: undefined }) declare readonly textAlign?: TextAlign;
    @property({ default: undefined }) declare readonly fill?: Fill;

    constructor(props: NodeConfig<DefaultTextStyle, DefaultTextStyleProps>) {
        super(props);
    }

    protected override provideContext(parent: ContextMap): ContextMap {
        const p = this._props as Record<string, unknown> | undefined;
        if (!p) return parent;
        const td: TextDefaults = { ...parent.get(TextStyleToken) };
        let changed = false;
        for (const key of TEXT_STYLE_KEYS) {
            if (p[key] !== undefined) {
                (td as Record<string, unknown>)[key] = p[key];
                changed = true;
            }
        }
        return changed ? parent.with(TextStyleToken, td) : parent;
    }
}
