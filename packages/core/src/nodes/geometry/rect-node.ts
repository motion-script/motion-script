import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { Clip } from "@/render/clip";
import { lerpNumber } from "@/tween/lerp";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Size2D } from "@/attributes/layout/size";
import { PaddingResolved } from "@/attributes/layout/padding";
import { StrokeResolved } from "@/attributes/shape/stroke/mapper";
import { MeasureScope } from "@/render/measure-scope";
import { resolveSize } from "@/layout/size-resolver";
import { applyPadding, expandByPadding } from "@/layout/padding";
import { Vector2 } from "@/attributes/layout/vector2";
import { AlignInput, resolveAlign, lerpAlign } from "@/attributes/layout/align";
import { FlexChild, FlexMeasureEntry, layoutFlex, measureFlex, GapSize, FlexDirection } from "@/layout/flex";
import { RectCornerRadius, CornerRadiusResolved, resolveCornerRadius, lerpCornerRadius } from "@/attributes/shape/corners/corner-radius";
import { RectCornerStyle, CornerStyleResolved, resolveCornerStyle, lerpCornerStyle } from "@/attributes/shape/corners/corner-style";
import { ShapeNode, ShapeProps } from "./shape-node";
import { Node, NodeConfig } from "../base/node";
import { property } from "@/attributes/properties/decorator";


export type LayoutMode = "row" | "column" | "stack";

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
    align: AlignInput;
    /** Corner radius in pixels — uniform, per-corner, or per-axis. */
    cornerRadius: RectCornerRadius;
    /** How each corner is shaped once it has a radius: `'rounded'` or `'angled'`. */
    cornerStyle: RectCornerStyle;
}


interface FlexNodeMeasure {
    kind: "flex";
    entries: FlexMeasureEntry<FlexChild>[];
    children: Node[];
    hugWidth: number;
    hugHeight: number;
}

interface StackNodeMeasure {
    kind: "stack";
    sizes: Partial<Size2D>[];
    children: Node[];
    hugWidth: number;
    hugHeight: number;
}

type NodeMeasureResult = FlexNodeMeasure | StackNodeMeasure;

/**
 * The Rectangle is the only node that performs flex / stack layout on its
 * children. It measures and positions children according to `group`
 * (row | column | stack), `gap`, `align`, and `padding`, then draws
 * itself as a rounded rect behind them.
 */
export class Rect extends ShapeNode<RectProps> {


    @property({ default: 0 }) declare readonly gap: GapSize;
    // Declared as the loose `AlignInput` so one @property covers both assignment
    // (`this.align = 'center'`) and reads. At runtime the accessor stores the
    // resolved per-axis `Vector2` pivot; readers cast at the read site.
    @property({ default: "center", mapper: (v: AlignInput) => resolveAlign(v), tween: lerpAlign })
    declare align: AlignInput;
    // Declared as the loose `RectCornerRadius`/`RectCornerStyle` so one @property
    // covers both assignment (`this.cornerRadius = 8`) and reads. At runtime the
    // accessor stores the resolved per-corner value; readers that need the
    // resolved shape cast at the read site (none here — RectState/Clip accept the
    // loose type).
    @property({ default: 0, mapper: (v: RectCornerRadius, p?: CornerRadiusResolved) => resolveCornerRadius(v, p), tween: lerpCornerRadius })
    declare cornerRadius: RectCornerRadius;
    @property({ default: "rounded", mapper: (v: RectCornerStyle, p?: CornerStyleResolved) => resolveCornerStyle(v, p), tween: lerpCornerStyle })
    declare cornerStyle: RectCornerStyle;

    declare group: LayoutMode;

    private _cachedMeasure: NodeMeasureResult | null = null;
    private _cachedMeasureFrom: NodeMeasureResult | null = null;
    private _groupBlend: { from: LayoutMode; to: LayoutMode; t: number } | null = null;

    /**
     * Discard the measure cached by the last {@link measure} pass so the next
     * {@link layout} recomputes children against the layout bounds. Used by a
     * `fit` {@link Scene}, which is measured by its parent against its small cell
     * but lays its children out against the full viewport.
     */
    protected invalidateMeasure(): void {
        this._cachedMeasure = null;
        this._cachedMeasureFrom = null;
    }

    constructor(props: NodeConfig<Rect, RectProps>) {
        super(props);
        this.applyGroupProp(props.group ?? "stack");
    }

    // group has a closure-based tween that captures _groupBlend, so it can't be
    // expressed as a static @property decorator. Shared by the constructor and
    // reinitProps() so a disposed-then-reused Rect gets the same group binding.
    private applyGroupProp(initial: LayoutMode | (() => LayoutMode)): void {
        this.applyProp<LayoutMode>("group", initial, {
            tween: (from: LayoutMode, to: LayoutMode, t: number): LayoutMode => {
                if (from === to) return to;
                if (t >= 1) {
                    this._groupBlend = null;
                    return to;
                }
                if (
                    !this._groupBlend ||
                    this._groupBlend.from !== from ||
                    this._groupBlend.to !== to
                ) {
                    this._groupBlend = { from, to, t };
                } else {
                    this._groupBlend.t = t;
                }
                return from;
            },
        });
    }

    // Re-apply Rect's constructor-specific prop defaults after the base class
    // re-creates its signals. Only runs when signals were disposed; the explicit
    // values get re-set when the scene is rebuilt, so defaults are a fine baseline.
    protected override reinitProps(): void {
        if (this.__signals) return;
        super.reinitProps();
        this.applyGroupProp("row");
    }

    // ---- Drawing ----------------------------------------------------------

    protected renderSelf(draw: RenderContext): void {
        draw.draw(new Graphics()
            .rect({
                width: this.layoutRect.width,
                height: this.layoutRect.height,
                cornerRadius: this.cornerRadius,
                cornerStyle: this.cornerStyle,
                start: this.start,
                end: this.end,
            })
            .shadow(this.shadow).fill(this.fill).stroke(this.stroke));
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
    private effectivePadding(): PaddingResolved {
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

    // ---- Measure ----------------------------------------------------------

    override measure(constraints: SizeConstraints, scope: MeasureScope): Partial<Size2D> {
        const maxWidth = constraints.maxWidth ?? 0;
        const maxHeight = constraints.maxHeight ?? 0;

        const widthIsHug = this.width === "hug";
        const heightIsHug = this.height === "hug";
        const outerForChildrenW = widthIsHug ? maxWidth : resolveSize(this.width, maxWidth, 0);
        const outerForChildrenH = heightIsHug ? maxHeight : resolveSize(this.height, maxHeight, 0);
        const padding = this.effectivePadding();
        const inner = applyPadding(outerForChildrenW, outerForChildrenH, padding);

        let hugInnerW: number;
        let hugInnerH: number;

        if (this._groupBlend) {
            const fromM = this.computeMeasure(this._groupBlend.from, inner.width, inner.height, scope);
            const toM = this.computeMeasure(this._groupBlend.to, inner.width, inner.height, scope);
            this._cachedMeasureFrom = fromM;
            this._cachedMeasure = toM;
            const t = this._groupBlend.t;
            hugInnerW = lerpNumber(fromM.hugWidth, toM.hugWidth, t);
            hugInnerH = lerpNumber(fromM.hugHeight, toM.hugHeight, t);
        } else {
            const m = this.computeMeasure(this.group, inner.width, inner.height, scope);
            this._cachedMeasure = m;
            this._cachedMeasureFrom = null;
            hugInnerW = m.hugWidth;
            hugInnerH = m.hugHeight;
        }

        const hugOuter = expandByPadding(hugInnerW, hugInnerH, padding);
        return {
            width: widthIsHug ? resolveSize(this.width, maxWidth, hugOuter.width) : outerForChildrenW,
            height: heightIsHug ? resolveSize(this.height, maxHeight, hugOuter.height) : outerForChildrenH,
        };
    }

    override layout(rect: BoxBounds, scope: MeasureScope): void {
        this.setLayoutRect(rect);

        const padding = this.effectivePadding();
        const inner = applyPadding(rect.width, rect.height, padding);

        if (this._groupBlend && this._cachedMeasure && this._cachedMeasureFrom) {
            const blend = this._groupBlend;
            const fromLayouts = this.computeChildLayouts(
                blend.from,
                rect,
                this._cachedMeasureFrom,
                inner.width,
                inner.height,
                padding,
            );
            const toLayouts = this.computeChildLayouts(
                blend.to,
                rect,
                this._cachedMeasure,
                inner.width,
                inner.height,
                padding,
            );
            const t = blend.t;
            const children = this._cachedMeasure.children;
            for (let i = 0; i < children.length; i++) {
                const f = fromLayouts[i];
                const to = toLayouts[i];
                children[i].layout({
                    x: lerpNumber(f.x, to.x, t),
                    y: lerpNumber(f.y, to.y, t),
                    width: lerpNumber(f.width, to.width, t),
                    height: lerpNumber(f.height, to.height, t),
                }, scope);
            }
            this._cachedMeasure = null;
            this._cachedMeasureFrom = null;
            return;
        }

        const measure = this._cachedMeasure ?? this.computeMeasure(this.group, inner.width, inner.height, scope);
        this._cachedMeasure = null;

        const layouts = this.computeChildLayouts(this.group, rect, measure, inner.width, inner.height, padding);
        for (let i = 0; i < measure.children.length; i++) {
            measure.children[i].layout(layouts[i], scope);
        }
    }

    private computeMeasure(
        mode: LayoutMode,
        innerWidth: number,
        innerHeight: number,
        scope: MeasureScope,
    ): NodeMeasureResult {
        if (mode === "stack") {
            return this.computeStackMeasure(innerWidth, innerHeight, scope);
        }
        return this.computeFlexMeasure(mode, innerWidth, innerHeight, scope);
    }

    private computeChildLayouts(
        mode: LayoutMode,
        rect: BoxBounds,
        measure: NodeMeasureResult,
        innerWidth: number,
        innerHeight: number,
        padding: PaddingResolved,
    ): BoxBounds[] {
        if (measure.kind === "stack") {
            return this.computeStackLayouts(rect, measure, padding);
        }
        return layoutFlex({
            direction: mode as FlexDirection,
            entries: measure.entries,
            rect,
            innerWidth,
            innerHeight,
            gap: this.gap,
            alignment: this.align as Vector2,
            padding,
        });
    }

    private computeFlexMeasure(
        direction: FlexDirection,
        innerWidth: number,
        innerHeight: number,
        scope: MeasureScope,
    ): FlexNodeMeasure {
        const transformChildren = this.children.filter(
            (c): c is Node => c instanceof Node,
        );
        const adapters: FlexChild[] = transformChildren.map((child) => ({
            widthMode: child.width,
            heightMode: child.height,
            mainFlex: child.flex,
            measure: (c: SizeConstraints) => child.measure(c, scope),
        }));

        const result = measureFlex(adapters, {
            direction,
            innerWidth,
            innerHeight,
            gap: this.gap,
            parentWidthMode: this.width,
            parentHeightMode: this.height,
        });

        return {
            kind: "flex",
            entries: result.entries,
            children: transformChildren,
            hugWidth: result.hugWidth,
            hugHeight: result.hugHeight,
        };
    }

    private computeStackMeasure(
        innerWidth: number,
        innerHeight: number,
        scope: MeasureScope,
    ): StackNodeMeasure {
        const transformChildren = this.children.filter(
            (c): c is Node => c instanceof Node,
        );
        const constraints: SizeConstraints = { maxWidth: innerWidth, maxHeight: innerHeight };
        let hugWidth = 0;
        let hugHeight = 0;
        const sizes: Partial<Size2D>[] = [];
        for (const child of transformChildren) {
            const size = child.measure(constraints, scope);
            sizes.push(size);
            const w = size.width ?? 0;
            const h = size.height ?? 0;
            if (w > hugWidth) hugWidth = w;
            if (h > hugHeight) hugHeight = h;
        }
        return {
            kind: "stack",
            sizes,
            children: transformChildren,
            hugWidth,
            hugHeight,
        };
    }

    private computeStackLayouts(rect: BoxBounds, measure: StackNodeMeasure, pad: PaddingResolved): BoxBounds[] {
        const innerW = Math.max(0, rect.width - pad.left - pad.right);
        const innerH = Math.max(0, rect.height - pad.top - pad.bottom);
        const offsetX = (pad.left - pad.right) / 2;
        const offsetY = (pad.top - pad.bottom) / 2;

        const align = this.align as Vector2;
        const result: BoxBounds[] = [];
        for (const size of measure.sizes) {
            const w = size.width ?? 0;
            const h = size.height ?? 0;
            const slackX = Math.max(0, innerW - w);
            const slackY = Math.max(0, innerH - h);
            const localX = offsetX + (align.x * slackX) / 2;
            const localY = offsetY - (align.y * slackY) / 2;
            result.push({ x: localX, y: localY, width: w, height: h });
        }
        return result;
    }
}
