import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { Clip } from "@/render/clip";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Size2D } from "@/attributes/layout/size";
import { PaddingResolved } from "@/attributes/layout/padding";
import { StrokeResolved } from "@/attributes/shape/stroke/mapper";
import { MeasureScope } from "@/render/measure-scope";
import { Alignment } from "@/attributes/layout/align";
import { GapSize } from "@/layout/flex";
import { GroupLayout, GroupHost, LayoutMode } from "@/layout/group-engine";
import { RectCornerRadius } from "@/attributes/shape/corners/corner-radius";
import { RectCornerStyle } from "@/attributes/shape/corners/corner-style";
import { ShapeNode, ShapeProps } from "./shape-node";
import { Node, NodeConfig } from "../base/node";
import { property } from "@/attributes/properties/decorator";
import { alignProperty, cornerRadiusProperty, cornerStyleProperty } from "@/attributes/properties/typed";
import { lerpSizeInput } from "@/layout/tweens";


export type { LayoutMode };

export type { FlexDirection, GapSize } from "@/layout/flex";

export type FlexSize = number | "fill" | "hug";

export interface RectProps extends ShapeProps {
    /** Layout mode for children: flex `row` / `column`, or overlapping `stack`. */
    group: LayoutMode;
    /** Spacing between children along the layout's main axis. */
    gap: GapSize;
    /**
     * Alignment of children within the content box: a named position
     * (`'center'`, `'topLeft'`, …) or an explicit per-axis pivot `Vector2`
     * (x: -1 left … +1 right, y: -1 bottom … +1 top).
     */
    align: Alignment;
    /** Corner radius in pixels — uniform, per-corner, or per-axis. */
    cornerRadius: RectCornerRadius;
    /** How each corner is shaped once it has a radius: `'rounded'` or `'angled'`. */
    cornerStyle: RectCornerStyle;
}

/**
 * The Rectangle is the only node that performs flex / stack layout on its
 * children. It measures and positions children according to `group`
 * (row | column | stack), `gap`, `align`, and `padding`, then draws
 * itself as a rounded rect behind them.
 */
export class Rect<P extends RectProps = RectProps> extends ShapeNode<P> implements GroupHost {


    @property({ default: 0 }) declare readonly gap: GapSize;
    // Declared as the loose `Alignment` so one @property covers both assignment
    // (`this.align = 'center'`) and reads. At runtime the accessor stores the
    // resolved per-axis `Vector2` pivot; readers cast at the read site.
    @alignProperty()
    declare align: Alignment;
    // Declared as the loose `RectCornerRadius`/`RectCornerStyle` so one @property
    // covers both assignment (`this.cornerRadius = 8`) and reads. At runtime the
    // accessor stores the resolved per-corner value; readers that need the
    // resolved shape cast at the read site (none here — RectState/Clip accept the
    // loose type).
    @cornerRadiusProperty()
    declare cornerRadius: RectCornerRadius;
    @cornerStyleProperty()
    declare cornerStyle: RectCornerStyle;

    declare group: LayoutMode;

    // Flex/stack child layout (including the cross-mode `group` blend) lives in a
    // shared engine so Rect and RootNode don't each carry a copy.
    private readonly _groupLayout = new GroupLayout(this);

    /**
     * Discard the measure cached by the last {@link measure} pass so the next
     * {@link layout} recomputes children against the layout bounds. Used by a
     * `fit` {@link Scene}, which is measured by its parent against its small cell
     * but lays its children out against the full viewport.
     */
    protected invalidateMeasure(): void {
        this._groupLayout.invalidateMeasure();
    }

    constructor(props: NodeConfig<Rect<P>, P>) {
        super(props);
        this.applyGroupProp(props.group ?? "stack");
    }

    /**
     * Figma-style smart default (see base {@link Node.applyDefaultSize}), plus
     * one refinement for flex/stack containers: hugging an axis that a direct
     * child asks to `"fill"` stacks the child against nothing — the child would
     * either collapse to 0 (stack, or the container's cross axis) or measure
     * unconstrained (row/column main axis; see `measureFlex`'s Figma-mirroring
     * comment). Since JSX children are already-constructed `Node`s by the time
     * they reach this constructor, their own resolved `width`/`height` can be
     * inspected here — so a bare `fill` child flips *this* default from `hug`
     * to `fill` on that exact axis, matching what the author almost certainly
     * wants. An explicit `width`/`height` on this Rect always wins; this only
     * adjusts the *default* used when neither is given.
     *
     * `group` isn't applied to its signal until after `super()` returns (see
     * constructor above), so the raw `props.group` is read here instead —
     * `"row"`/`"column"` only promote their single main axis; `"stack"` (the
     * default, and the mode with no distinct main axis) checks both axes
     * independently.
     */
    protected override applyDefaultSize(props?: NodeConfig<any, P>): void {
        const children = Node.flattenChildrenProp(props);
        const hasChildren = children.length > 0;
        const group: LayoutMode = (props as any)?.group ?? "stack";

        const widthIsMain = group === "row" || group === "stack";
        const heightIsMain = group === "column" || group === "stack";

        const defaultWidth = hasChildren && widthIsMain && Node.hasFillChild(children, "width") ? "fill" : hasChildren ? "hug" : "fill";
        const defaultHeight = hasChildren && heightIsMain && Node.hasFillChild(children, "height") ? "fill" : hasChildren ? "hug" : "fill";

        if (!props || props.width === undefined) this.applyProp("width", defaultWidth, { tween: lerpSizeInput });
        if (!props || props.height === undefined) this.applyProp("height", defaultHeight, { tween: lerpSizeInput });
    }

    // group has a closure-based tween (the engine captures the in-flight blend),
    // so it can't be expressed as a static @property decorator. Shared by the
    // constructor and reinitProps() so a disposed-then-reused Rect keeps the same
    // group binding. Defaults to "stack" — overlapping children, not a row.
    private applyGroupProp(initial: LayoutMode | (() => LayoutMode)): void {
        this.applyProp<LayoutMode>("group", initial, { tween: this._groupLayout.groupTween });
    }


    // ---- Drawing ----------------------------------------------------------

    protected override shapeGraphics(): Graphics {
        return new Graphics().rect({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
            start: this.start,
            end: this.end,
        });
    }

    protected renderSelf(draw: RenderContext): void {
        // Stroke is deferred to renderStroke (drawn after children + overlay).
        draw.draw(this.shapeGraphics().shadow(this.shadow).fill(this.fill));
    }

    protected override clipSelf(): Clip {
        return new Clip().rect({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
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
    // Public so the shared GroupLayout engine can read it via the GroupHost interface.
    effectivePadding(): PaddingResolved {
        let extra = 0;
        const p = this.padding as PaddingResolved;
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
    // Flex/stack measure + child layout (and the cross-mode `group` blend) are
    // delegated to the shared GroupLayout engine, which reads this node through
    // the GroupHost interface (children/width/height/group/gap/align +
    // effectivePadding).

    override measure(constraints: SizeConstraints, scope: MeasureScope): Partial<Size2D> {
        return this._groupLayout.measure(constraints, scope);
    }

    override layout(rect: BoxBounds, scope: MeasureScope): void {
        this.setLayoutRect(rect);
        this._groupLayout.layout(rect, scope);
    }
}
