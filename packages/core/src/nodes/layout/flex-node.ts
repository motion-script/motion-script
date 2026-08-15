import { SizeConstraints } from "@/attributes/layout/constraints";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Size2D } from "@/attributes/layout/size";
import { Measurer } from "@/render/measurer";
import { resolveSize } from "@/layout/size-resolver";
import { applyPadding, expandByPadding } from "@/layout/padding";
import { InsetsResolved } from "@/attributes/layout/insets";
import { StrokeResolved } from "@/attributes/shape/stroke/mapper";
import { lerpSizeInput } from "@/layout/tweens";
import { Vector2 } from "@/attributes/layout/vector2";
import { Anchor } from "@/attributes/layout/anchor";
import { FlexChild, FlexDirection, FlexMeasureEntry, GapSize, layoutFlex, measureFlex } from "@/layout/flex";
import { Node, NodeConfig } from "../base/node";
import { ShapeNode, ShapeProps } from "../geometry/shape-node";
import { Graphics } from "@/render/graphics";
import { Clip } from "@/render/clip";
import { RectCornerRadius } from "@/attributes/shape/corners/corner-radius";
import { RectCornerStyle } from "@/attributes/shape/corners/corner-style";
import { property } from "@/attributes/properties/decorator";
import { anchorProperty, cornerRadiusProperty, cornerStyleProperty } from "@/attributes/properties/typed";


export type { FlexDirection, GapSize } from "@/layout/flex";


export interface FlexProps extends ShapeProps {
    /** Spacing between children along the main axis. */
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


interface FlexMeasureCache {
    entries: FlexMeasureEntry<FlexChild>[];
    children: Node[];
    hugWidth: number;
    hugHeight: number;
}


/**
 * Base for the {@link Row} and {@link Column} convenience containers. A flex
 * container that, like {@link Rect}, is also a full shape: it measures and
 * positions its children along a fixed main axis (set by the subclass via
 * {@link direction}) honouring `gap`, `align`, and `padding`, and draws itself
 * as a (by default invisible) rounded rect behind them with the inherited
 * `fill`, `stroke`, `shadow`, `cornerRadius`, `clip`, and `effects` props.
 *
 * It is the single-direction half of {@link Rect} (no switchable `flow` mode) and
 * always hugs its content by default. Reach for `Rect` when you want to switch
 * between horizontal/vertical/freeform; reach for `Row`/`Column` for a fixed
 * direction.
 */
export abstract class FlexNode<P extends FlexProps = FlexProps> extends ShapeNode<P> {

    @property({ default: 0 }) declare readonly gap: GapSize;
    // Stored resolved as a per-axis `Vector2` pivot; the loose `Anchor`
    // declared type covers both named-string assignment and reads. See Rect.
    @anchorProperty()
    declare align: Anchor;
    // Declared as the loose `RectCornerRadius`/`RectCornerStyle` so one @property
    // covers both assignment and reads; the accessor stores the resolved value. See Rect.
    @cornerRadiusProperty()
    declare cornerRadius: RectCornerRadius;
    @cornerStyleProperty()
    declare cornerStyle: RectCornerStyle;

    /** Main axis this container lays its children along. */
    protected abstract readonly direction: FlexDirection;

    private _cachedMeasure: FlexMeasureCache | null = null;

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

    protected override clipSelf(): Clip {
        return new Clip().rect({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
        });
    }

    // Row/Column lay out around their content, so — unlike Rect, whose empty
    // form fills the parent — they always hug, even with no children, rather
    // than stretching to fill. The one refinement: hugging the *main* axis
    // while a direct child asks to fill that same axis strands the child with
    // no space to fill into (it measures unconstrained instead — see
    // measureFlex's Figma-mirroring comment), so that axis defaults to fill
    // instead. `this.direction` isn't set yet at this point in construction
    // (Row/Column assign it as a field initializer, which runs after `super()`
    // returns) — Row/Column each call this via a one-line override that passes
    // their own known-constant main axis instead of reading `this.direction`.
    protected applyFlexDefaultSize(props: NodeConfig<any, P> | undefined, mainAxis: "width" | "height"): void {
        const children = Node.flowChildrenProp(props);
        const mainDefault = Node.hasFillChild(children, mainAxis) ? "fill" : "hug";

        if (!props || props.width === undefined) {
            this.applyProp("width", mainAxis === "width" ? mainDefault : "hug", { tween: lerpSizeInput });
        }
        if (!props || props.height === undefined) {
            this.applyProp("height", mainAxis === "height" ? mainDefault : "hug", { tween: lerpSizeInput });
        }
    }

    // Children must sit inside the stroke (drawn at the layout-rect edge), so the
    // intruding portion of any stroke is added to the content padding — same rule
    // as Rect.effectivePadding. The intrusion of a stroke is weight·(1 - align)/2:
    // inside strokes (align -1) intrude their full weight, centered (align 0) half,
    // outside (align +1) none.
    private effectivePadding(): InsetsResolved {
        const p = this.padding as InsetsResolved;
        const strokes = this.stroke as StrokeResolved[];
        if (!strokes || !(Symbol.iterator in Object(strokes))) return p;
        let extra = 0;
        for (const s of strokes) {
            const intrusion = s.weight * (1 - s.align) / 2;
            if (intrusion > extra) extra = intrusion;
        }
        if (extra === 0) return p;
        return { left: p.left + extra, right: p.right + extra, top: p.top + extra, bottom: p.bottom + extra };
    }

    override measure(constraints: SizeConstraints, scope: Measurer): Partial<Size2D> {
        // Retain constraints + scope for off-tree work (see Node.measure / the
        // animated child-insert in node-lifecycle.ts) — this override doesn't call
        // super, so mirror the base capture here.
        this.constraints = constraints;
        this._lastScope = scope;

        const maxWidth = constraints.maxWidth ?? 0;
        const maxHeight = constraints.maxHeight ?? 0;

        const widthIsHug = this.width === "hug";
        const heightIsHug = this.height === "hug";
        const outerW = widthIsHug ? maxWidth : resolveSize(this.width, maxWidth, 0);
        const outerH = heightIsHug ? maxHeight : resolveSize(this.height, maxHeight, 0);
        const padding = this.effectivePadding();
        const inner = applyPadding(outerW, outerH, padding);

        const m = this.computeMeasure(inner.width, inner.height, scope);
        this._cachedMeasure = m;

        const hugOuter = expandByPadding(m.hugWidth, m.hugHeight, padding);
        return {
            width: widthIsHug ? resolveSize(this.width, maxWidth, hugOuter.width) : outerW,
            height: heightIsHug ? resolveSize(this.height, maxHeight, hugOuter.height) : outerH,
        };
    }

    override layout(rect: BoxBounds, scope: Measurer): void {
        this.setLayoutRect(rect);

        const padding = this.effectivePadding();
        const inner = applyPadding(rect.width, rect.height, padding);

        const measure = this._cachedMeasure ?? this.computeMeasure(inner.width, inner.height, scope);
        this._cachedMeasure = null;

        const layouts = layoutFlex({
            direction: this.direction,
            entries: measure.entries,
            rect,
            innerWidth: inner.width,
            innerHeight: inner.height,
            gap: this.gap,
            alignment: this.align as Vector2,
            padding,
            debugName: this.name,
        });
        for (let i = 0; i < measure.children.length; i++) {
            measure.children[i].layout(layouts[i], scope);
        }

        // Stage-pinned children take no part in the flex run above — they're
        // placed against the scene root instead. See NodeProps.childPositioning.
        this.layoutAbsoluteChildren(scope);
    }

    private computeMeasure(innerWidth: number, innerHeight: number, scope: Measurer): FlexMeasureCache {
        const children = this.flowChildren();
        const adapters: FlexChild[] = children.map((child) => ({
            widthMode: child.width,
            heightMode: child.height,
            mainFlex: child.flex,
            gapScale: child.gapScale,
            measure: (c: SizeConstraints) => child.measure(c, scope),
        }));

        const result = measureFlex(adapters, {
            direction: this.direction,
            innerWidth,
            innerHeight,
            gap: this.gap,
            parentWidthMode: this.width,
            parentHeightMode: this.height,
        });

        return {
            entries: result.entries,
            children,
            hugWidth: result.hugWidth,
            hugHeight: result.hugHeight,
        };
    }
}
