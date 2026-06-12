import { SizeConstraints } from "@/attributes/layout/constraints";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Size2D } from "@/attributes/layout/size";
import { MeasureScope } from "@/render/measure-scope";
import { resolveSize } from "@/layout/size-resolver";
import { applyPadding, expandByPadding } from "@/layout/padding";
import { lerpSizeInput } from "@/layout/tweens";
import { lerpVector2, Vector2 } from "@/attributes/layout/vector2";
import { FlexChild, FlexDirection, FlexMeasureEntry, GapSize, layoutFlex, measureFlex } from "@/layout/flex";
import { Node, NodeConfig, NodeProps } from "../base/node";
import { property } from "@/attributes/properties/decorator";


export type { FlexDirection, GapSize } from "@/layout/flex";


export interface FlexProps extends NodeProps {
    /** Spacing between children along the main axis. */
    gap: GapSize;
    /** Per-axis alignment of children within the content box (-1…1). */
    alignment: Vector2;
}


interface FlexMeasureCache {
    entries: FlexMeasureEntry<FlexChild>[];
    children: Node[];
    hugWidth: number;
    hugHeight: number;
}


/**
 * Base for the {@link Row} and {@link Column} convenience containers. A pure
 * flex-layout node: it measures and positions its children along a fixed main
 * axis (set by the subclass via {@link direction}) honouring `gap`, `alignment`,
 * and `padding`, but draws nothing itself.
 *
 * It is the layout half of {@link Rect} without the shape — no fill, stroke,
 * shadow, border-radius, or `stack` mode. Reach for `Rect` when you want a
 * visible box that also lays out children; reach for `Row`/`Column` when you
 * only need the layout.
 */
export abstract class FlexNode<P extends FlexProps = FlexProps> extends Node<P> {

    @property({ default: 0 }) declare readonly gap: GapSize;
    @property({ default: { x: 0, y: 0 }, tween: lerpVector2 }) declare readonly alignment: Vector2;

    /** Main axis this container lays its children along. */
    protected abstract readonly direction: FlexDirection;

    private _cachedMeasure: FlexMeasureCache | null = null;

    constructor(props: NodeConfig<any, P>) {
        super(props);
        // A flex container hugs its children by default, so it shrink-wraps the
        // content unless an explicit size (or `flex`, meaning "fill the parent's
        // main axis") was given. Mirrors Rect's has-children sizing.
        if (props.width === undefined && props.flex === undefined) {
            this.applyProp("width", "hug", { tween: lerpSizeInput });
        }
        if (props.height === undefined && props.flex === undefined) {
            this.applyProp("height", "hug", { tween: lerpSizeInput });
        }
    }

    override measure(constraints: SizeConstraints, scope: MeasureScope): Partial<Size2D> {
        const maxWidth = constraints.maxWidth ?? 0;
        const maxHeight = constraints.maxHeight ?? 0;

        const widthIsHug = this.width === "hug";
        const heightIsHug = this.height === "hug";
        const outerW = widthIsHug ? maxWidth : resolveSize(this.width, maxWidth, 0);
        const outerH = heightIsHug ? maxHeight : resolveSize(this.height, maxHeight, 0);
        const padding = this.padding;
        const inner = applyPadding(outerW, outerH, padding);

        const m = this.computeMeasure(inner.width, inner.height, scope);
        this._cachedMeasure = m;

        const hugOuter = expandByPadding(m.hugWidth, m.hugHeight, padding);
        return {
            width: widthIsHug ? resolveSize(this.width, maxWidth, hugOuter.width) : outerW,
            height: heightIsHug ? resolveSize(this.height, maxHeight, hugOuter.height) : outerH,
        };
    }

    override layout(rect: BoxBounds, scope: MeasureScope): void {
        super.layout(rect, scope);

        const padding = this.padding;
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
            alignment: this.alignment,
            padding,
        });
        for (let i = 0; i < measure.children.length; i++) {
            measure.children[i].layout(layouts[i], scope);
        }
    }

    private computeMeasure(innerWidth: number, innerHeight: number, scope: MeasureScope): FlexMeasureCache {
        const children = this.children.filter((c): c is Node => c instanceof Node);
        const adapters: FlexChild[] = children.map((child) => ({
            widthMode: child.width,
            heightMode: child.height,
            mainFlex: child.flex,
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
