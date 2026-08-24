import { Graphics2D } from "@/render/graphics2d";
import { Clip } from "@/render/clip";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Size2D } from "@/attributes/layout/size";
import { InsetsResolved } from "@/attributes/layout/insets";
import { StrokeResolved } from "@/attributes/shape/stroke/mapper";
import { Measurer2D } from "@/render/measurer";
import { Anchor } from "@/attributes/layout/anchor";
import { GapSize } from "@/layout/flex";
import { FlowLayout, FlowHost, FlowMode } from "@/layout/flow-engine";
import { RectCornerRadius } from "@/attributes/shape/corners/corner-radius";
import { RectCornerStyle } from "@/attributes/shape/corners/corner-style";
import { ShapeNode, ShapeProps } from "./shape-node";
import { Node2D, NodeConfig } from "@/nodes/2d/node2d";
import { property } from "@/attributes/properties/decorator";
import { anchorProperty, cornerRadiusProperty, cornerStyleProperty } from "@/attributes/properties/typed";
import { lerpSizeInput } from "@/layout/tweens";


export type { FlowMode };

export type { FlexDirection, GapSize } from "@/layout/flex";

export type FlexSize = number | "fill" | "hug";

export interface RectProps extends ShapeProps {
    /** Layout mode for children: flex `horizontal` / `vertical`, or overlapping `freeform`. */
    flow: FlowMode;
    /** Spacing between children along the layout's main axis. */
    gap: GapSize;
    /**
     * Alignment of children within the content box: a named position
     * (`'center'`, `'topLeft'`, …) or an explicit per-axis pivot `Vector2`
     * (x: -1 left … +1 right, y: -1 bottom … +1 top).
     */
    align: Anchor;
    /** Corner radius in pixels — uniform, per-corner, or per-axis. */
    cornerRadius: RectCornerRadius;
    /** How each corner is shaped once it has a radius: `'rounded'` or `'angled'`. */
    cornerStyle: RectCornerStyle;
}

/**
 * The Rectangle is the only node that performs flex / freeform layout on its
 * children. It measures and positions children according to `flow`
 * (horizontal | vertical | freeform), `gap`, `align`, and `padding`, then draws
 * itself as a rounded rect behind them.
 */
export class Rect<P extends RectProps = RectProps> extends ShapeNode<P> implements FlowHost {


    @property({ default: 0 }) declare readonly gap: GapSize;
    // Declared as the loose `Anchor` so one @property covers both assignment
    // (`this.align = 'center'`) and reads. At runtime the accessor stores the
    // resolved per-axis `Vector2` pivot; readers cast at the read site.
    @anchorProperty()
    declare align: Anchor;
    // Declared as the loose `RectCornerRadius`/`RectCornerStyle` so one @property
    // covers both assignment (`this.cornerRadius = 8`) and reads. At runtime the
    // accessor stores the resolved per-corner value; readers that need the
    // resolved shape cast at the read site (none here — RectState/Clip accept the
    // loose type).
    @cornerRadiusProperty()
    declare cornerRadius: RectCornerRadius;
    @cornerStyleProperty()
    declare cornerStyle: RectCornerStyle;

    declare flow: FlowMode;

    // Flex/freeform child layout (including the cross-mode `flow` blend) lives in
    // a shared engine so Rect and Canvas2D don't each carry a copy.
    private readonly _flowLayout = new FlowLayout(this);

    /**
     * Discard the measure cached by the last {@link measure} pass so the next
     * {@link layout} recomputes children against the layout bounds. Used by a
     * `fit` {@link Scene}, which is measured by its parent against its small cell
     * but lays its children out against the full viewport.
     */
    protected invalidateMeasure(): void {
        this._flowLayout.invalidateMeasure();
    }

    constructor(props: NodeConfig<Rect<P>, P>) {
        super(props);
        this.applyFlowProp(props.flow ?? "freeform");
    }

    /**
     * Figma-style smart default (see base {@link Node2D.applyDefaultSize}), plus
     * one refinement for flex/freeform containers: hugging an axis that a direct
     * child asks to `"fill"` stacks the child against nothing — the child would
     * either collapse to 0 (freeform, or the container's cross axis) or measure
     * unconstrained (horizontal/vertical main axis; see `measureFlex`'s
     * Figma-mirroring comment). Since JSX children are already-constructed
     * `Node2D`s by the time they reach this constructor, their own resolved
     * `width`/`height` can be inspected here — so a bare `fill` child flips
     * *this* default from `hug` to `fill` on that exact axis, matching what the
     * author almost certainly wants. An explicit `width`/`height` on this Rect
     * always wins; this only adjusts the *default* used when neither is given.
     *
     * `flow` isn't applied to its signal until after `super()` returns (see
     * constructor above), so the raw `props.flow` is read here instead —
     * `"horizontal"`/`"vertical"` only promote their single main axis;
     * `"freeform"` (the default, and the mode with no distinct main axis) checks
     * both axes independently. Only flow children count: a canvas-pinned child
     * fills the canvas, not this box.
     */
    protected override applyDefaultSize(props?: NodeConfig<any, P>): void {
        const children = Node2D.flowChildrenProp(props);
        const hasChildren = children.length > 0;
        const flow: FlowMode = (props as any)?.flow ?? "freeform";

        const widthIsMain = flow === "horizontal" || flow === "freeform";
        const heightIsMain = flow === "vertical" || flow === "freeform";

        const defaultWidth = hasChildren && widthIsMain && Node2D.hasFillChild(children, "width") ? "fill" : hasChildren ? "hug" : "fill";
        const defaultHeight = hasChildren && heightIsMain && Node2D.hasFillChild(children, "height") ? "fill" : hasChildren ? "hug" : "fill";

        if (!props || props.width === undefined) this.applyProp("width", defaultWidth, { tween: lerpSizeInput });
        if (!props || props.height === undefined) this.applyProp("height", defaultHeight, { tween: lerpSizeInput });
    }

    // flow has a closure-based tween (the engine captures the in-flight blend),
    // so it can't be expressed as a static @property decorator. Defaults to
    // "freeform" — overlapping children, not a row.
    private applyFlowProp(initial: FlowMode | (() => FlowMode)): void {
        this.applyProp<FlowMode>("flow", initial, { tween: this._flowLayout.flowTween });
    }


    // ---- Drawing ----------------------------------------------------------

    protected override shapeGraphics(): Graphics2D {
        return new Graphics2D().rect({
            width: this.layoutBounds.width,
            height: this.layoutBounds.height,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
            start: this.start,
            end: this.end,
        });
    }

    protected override clipSelf(): Clip {
        return new Clip().rect({
            width: this.layoutBounds.width,
            height: this.layoutBounds.height,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
        });
    }

    // ---- Padding ----------------------------------------------------------

    // Children must sit inside the stroke; the stroke is drawn at the layout-rect
    // edge and would otherwise visually cover them. Only the portion of the
    // stroke that intrudes into the content box needs clearing, which depends on
    // its alignment: inside strokes (align -1) intrude their full weight, centered
    // strokes (align 0) half, outside strokes (align +1) none. The intrusion is
    // weight·(1 - align)/2.
    // Public so the shared FlowLayout engine can read it via the FlowHost interface.
    effectivePadding(): InsetsResolved {
        let extra = 0;
        const p = this.padding as InsetsResolved;
        const strokes = this.stroke as StrokeResolved[];
        if (!strokes || !(Symbol.iterator in Object(strokes))) {
            return p;
        }
        for (const s of strokes) {
            const intrusion = s.weight * (1 - s.align) / 2;
            if (intrusion > extra) extra = intrusion;
        }
        if (extra === 0) return p;
        return {
            left: p.left + extra,
            right: p.right + extra,
            top: p.top + extra,
            bottom: p.bottom + extra,
        };
    }

    // ---- Measure / layout -------------------------------------------------
    // Flex/freeform measure + child layout (and the cross-mode `flow` blend) are
    // delegated to the shared FlowLayout engine, which reads this node through
    // the FlowHost interface (children/width/height/flow/gap/align +
    // effectivePadding + flowChildren/layoutAbsoluteChildren).

    override measure(constraints: SizeConstraints, scope: Measurer2D): Partial<Size2D> {
        return this._flowLayout.measure(constraints, scope);
    }

    override layout(rect: BoxBounds, scope: Measurer2D): void {
        this.setLayoutBounds(rect);
        this._flowLayout.layout(rect, scope);
    }
}
