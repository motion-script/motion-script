import { SizeConstraints } from "@/attributes/layout/constraints";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Size2D, SizeInput } from "@/attributes/layout/size";
import { PaddingResolved } from "@/attributes/layout/padding";
import { MeasureScope } from "@/render/measure-scope";
import { resolveSize } from "@/layout/size-resolver";
import { applyPadding, expandByPadding } from "@/layout/padding";
import { lerpNumber } from "@/tween/lerp";
import { Vector2 } from "@/attributes/layout/vector2";
import { AlignInput } from "@/attributes/layout/align";
import { FlexChild, FlexMeasureEntry, layoutFlex, measureFlex, FlexDirection, GapSize } from "@/layout/flex";
import { Node } from "@/nodes/base/node";

export type LayoutMode = "row" | "column" | "stack";

/**
 * The slice of a container node the {@link GroupLayout} engine reads to lay its
 * children out. Both {@link Rect} and {@link RootNode} implement it, so the
 * flex/stack measure+layout pass — including the cross-mode `group` blend — lives
 * in one place rather than being duplicated per container.
 */
export interface GroupHost {
    readonly children: Node[];
    readonly width: SizeInput;
    readonly height: SizeInput;
    readonly group: LayoutMode;
    readonly gap: GapSize;
    /**
     * The `align` prop, declared loose (`AlignInput`) to match how containers
     * type it; at runtime the accessor stores the resolved per-axis `Vector2`
     * pivot, which the engine reads via {@link resolvedAlign}.
     */
    readonly align: AlignInput;
    /** Effective content padding (base padding plus any stroke intrusion). */
    effectivePadding(): PaddingResolved;
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
 * Flex / stack child layout for a container node, factored out of {@link Rect}.
 *
 * Owns the measure cache and the `group` cross-mode blend (animating between
 * `row`/`column`/`stack` interpolates each child's measured *and* positioned
 * box), reading everything it needs through a {@link GroupHost}. A host creates
 * one engine per node and forwards its `measure`/`layout` to it; the engine
 * exposes `beginGroupBlend` as the closure-based `group` tween so the host can
 * register it as that prop's tween.
 */
export class GroupLayout {
    private _cachedMeasure: NodeMeasureResult | null = null;
    private _cachedMeasureFrom: NodeMeasureResult | null = null;
    private _groupBlend: { from: LayoutMode; to: LayoutMode; t: number } | null = null;

    constructor(private readonly host: GroupHost) {}

    // The host stores the resolved per-axis pivot in its `align` cell even though
    // it declares the prop loose; read it back as the Vector2 the layout needs.
    private resolvedAlign(): Vector2 {
        return this.host.align as Vector2;
    }

    /**
     * The `group` prop's tween. Returns the `from` mode while a cross-mode
     * transition is mid-flight (so the measure/layout pass can interpolate the
     * two layouts) and snaps to `to` at `t >= 1`. Captures `_groupBlend`, which
     * is why `group` can't use a static `@property` tween — the host registers
     * this via `applyProp`.
     */
    readonly groupTween = (from: LayoutMode, to: LayoutMode, t: number): LayoutMode => {
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
    };

    /** Discard the cached measure so the next layout recomputes against its bounds. */
    invalidateMeasure(): void {
        this._cachedMeasure = null;
        this._cachedMeasureFrom = null;
    }

    measure(constraints: SizeConstraints, scope: MeasureScope): Partial<Size2D> {
        const host = this.host;
        const maxWidth = constraints.maxWidth ?? 0;
        const maxHeight = constraints.maxHeight ?? 0;

        const widthIsHug = host.width === "hug";
        const heightIsHug = host.height === "hug";
        const outerForChildrenW = widthIsHug ? maxWidth : resolveSize(host.width, maxWidth, 0);
        const outerForChildrenH = heightIsHug ? maxHeight : resolveSize(host.height, maxHeight, 0);
        const padding = host.effectivePadding();
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
            const m = this.computeMeasure(host.group, inner.width, inner.height, scope);
            this._cachedMeasure = m;
            this._cachedMeasureFrom = null;
            hugInnerW = m.hugWidth;
            hugInnerH = m.hugHeight;
        }

        const hugOuter = expandByPadding(hugInnerW, hugInnerH, padding);
        return {
            width: widthIsHug ? resolveSize(host.width, maxWidth, hugOuter.width) : outerForChildrenW,
            height: heightIsHug ? resolveSize(host.height, maxHeight, hugOuter.height) : outerForChildrenH,
        };
    }

    layout(rect: BoxBounds, scope: MeasureScope): void {
        const host = this.host;
        const padding = host.effectivePadding();
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

        const measure = this._cachedMeasure ?? this.computeMeasure(host.group, inner.width, inner.height, scope);
        this._cachedMeasure = null;

        const layouts = this.computeChildLayouts(host.group, rect, measure, inner.width, inner.height, padding);
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
            gap: this.host.gap,
            alignment: this.resolvedAlign(),
            padding,
        });
    }

    private computeFlexMeasure(
        direction: FlexDirection,
        innerWidth: number,
        innerHeight: number,
        scope: MeasureScope,
    ): FlexNodeMeasure {
        const transformChildren = this.host.children.filter(
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
            gap: this.host.gap,
            parentWidthMode: this.host.width,
            parentHeightMode: this.host.height,
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
        const transformChildren = this.host.children.filter(
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

        const align = this.resolvedAlign();
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
