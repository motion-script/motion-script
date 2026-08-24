import { Node2D, NodeConfig, Node2DProps } from "@/nodes/2d/node2d";
import { property } from "@/attributes/properties/decorator";
import { ContextMap } from "@/util/context";
import { TextStyleToken, TextStyle, TEXT_STYLE_KEYS } from "@/runtime/builtin-context";
import { Fill } from "@/attributes/shape/fill/chain";
import { TextAlign } from "@/attributes/text/align";
import { FontStyle } from "@/attributes/text/span";
import { type Stroke } from "@/attributes/shape/stroke/mapper";
import { type Shadow } from "@/attributes/shape/shadow/resolver";
import { type RenderPass2D } from "@/render/render-context2d";

export interface DefaultTextStyleProps extends Node2DProps {
    fontFamily: string;
    fontSize: number | 'autofit';
    fontWeight: number;
    fontStyle: FontStyle;
    letterSpacing: number;
    lineHeight: number;
    textAlign: TextAlign;
    fill: Fill;
    stroke: Stroke;
    shadow: Shadow;
}

/**
 * Sets default text styling for everything drawn below it — the {@link Text} /
 * {@link RichText} nodes *and* the raw `Graphics2D` `text`/`richText` ops a custom
 * node draws. A descendant inherits each style prop it didn't set itself, from
 * the nearest ancestor `DefaultTextStyle` that did — author-set props always win
 * over inherited ones. Nesting accumulates per key (an inner `fontSize` and an
 * outer `fontFamily` both apply).
 *
 * Two channels carry that, because a node and a drawing have nothing else in
 * common:
 *
 * - **Nodes**, through context. Built on the same machinery as {@link Provider}:
 *   it contributes the built-in {@link TextStyleToken}, merging only the keys the
 *   author explicitly passed onto any ancestor's defaults. It contributes the
 *   author's *raw* prop values (not resolved cell values), so each consumer
 *   resolves them once through its own mapper — e.g. `fill='red'` is resolved by
 *   `Text`'s fill mapper, not pre-resolved here.
 * - **Graphics2D**, through the render context ({@link RenderContext2D.pushTextStyle}),
 *   pushed around this node's children for the duration of their draw and folded
 *   into each under-specified text op. A `Graphics2D` isn't in the tree and has no
 *   bind step, so the draw scope is the only place it can inherit from.
 *
 *   Only the *shaping* keys reach a drawn op — `fill`/`stroke`/`shadow` are
 *   group-scoped paint ops in a `Graphics2D`, not per-shape slots, so defaulting
 *   them would change which shapes a group's paint covers. See
 *   {@link TEXT_SHAPING_KEYS}.
 *
 * A node that owns its typography opts out of the second channel with
 * `ctx.pushTextStyle(null)`; `@motion-script/code`'s `Code` does exactly that.
 *
 * Layout-transparent like {@link Provider} — carries style, not appearance.
 */
export class DefaultTextStyle extends Node2D<DefaultTextStyleProps> {
    @property({ default: undefined }) declare readonly fontFamily?: string;
    @property({ default: undefined }) declare readonly fontSize?: number | 'autofit';
    @property({ default: undefined }) declare readonly fontWeight?: number;
    @property({ default: undefined }) declare readonly fontStyle?: FontStyle;
    @property({ default: undefined }) declare readonly letterSpacing?: number;
    @property({ default: undefined }) declare readonly lineHeight?: number;
    @property({ default: undefined }) declare readonly textAlign?: TextAlign;
    @property({ default: undefined }) declare readonly fill?: Fill;
    @property({ default: undefined }) declare readonly stroke?: Stroke;
    @property({ default: undefined }) declare readonly shadow?: Shadow;

    constructor(props: NodeConfig<DefaultTextStyle, DefaultTextStyleProps>) {
        super(props);
    }

    protected override provideContext(parent: ContextMap): ContextMap {
        const p = this._props as Record<string, unknown> | undefined;
        if (!p) return parent;
        const td: TextStyle = { ...parent.get(TextStyleToken) };
        let changed = false;
        for (const key of TEXT_STYLE_KEYS) {
            if (p[key] !== undefined) {
                (td as Record<string, unknown>)[key] = p[key];
                changed = true;
            }
        }
        return changed ? parent.with(TextStyleToken, td) : parent;
    }

    /**
     * Open the render-context text-style scope around this node's children, so
     * the `Graphics2D` they draw inherit the same defaults their `Text` nodes do.
     *
     * `super.renderContent` is what renders those children, so the scope has to
     * wrap it — and be closed in a `finally`, since the stack outlives this node
     * and a leaked frame would restyle every sibling drawn after it.
     */
    protected override renderContent(ctx: RenderPass2D): void {
        ctx.pushTextStyle(this.currentStyle());
        try {
            super.renderContent(ctx);
        } finally {
            ctx.popTextStyle();
        }
    }

    /**
     * The keys this node currently sets, at their resolved values.
     *
     * Read off the properties rather than out of `_props` (which
     * {@link provideContext} uses): a prop can be a callback or mid-tween, and a
     * drawn op needs this frame's *value*. An unset prop defaults to `undefined`,
     * which is the same "didn't set it" signal the context channel reads.
     */
    private currentStyle(): TextStyle {
        const self = this as unknown as Record<string, unknown>;
        const style: Record<string, unknown> = {};
        for (const key of TEXT_STYLE_KEYS) {
            const value = self[key];
            if (value !== undefined) style[key] = value;
        }
        return style as TextStyle;
    }
}
