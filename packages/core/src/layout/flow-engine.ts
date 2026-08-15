import { SizeConstraints } from "@/attributes/layout/constraints";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Size2D, SizeInput } from "@/attributes/layout/size";
import { InsetsResolved } from "@/attributes/layout/insets";
import { Measurer } from "@/render/measurer";
import { resolveSize } from "@/layout/size-resolver";
import { applyPadding, expandByPadding } from "@/layout/padding";
import { lerpNumber } from "@/tween/lerp";
import { Vector2 } from "@/attributes/layout/vector2";
import { Anchor } from "@/attributes/layout/anchor";
import { FlexChild, FlexMeasureEntry, layoutFlex, measureFlex, FlexDirection, GapSize } from "@/layout/flex";
import { Node } from "@/nodes/base/node";

/**
 * How a container arranges the children that take part in its layout:
 *
 * - `'freeform'` — children overlap, each centred in the padded content box and
 *   offset from there by its own `x`/`y`.
 * - `'horizontal'` — a flex run left-to-right.
 * - `'vertical'` — a flex run top-to-bottom.
 */
export type FlowMode = "horizontal" | "vertical" | "freeform";

/** The flex main axis a directional {@link FlowMode} runs along. */
/** @internal */
export function flowDirection(mode: FlowMode): FlexDirection {
    return mode === "horizontal" ? "row" : "column";
}

/**
 * The slice of a container node the {@link FlowLayout} engine reads to lay its
 * children out. Both {@link Rect} and {@link RootNode} implement it, so the
 * flex/freeform measure+layout pass — including the cross-mode `flow` blend —
 * lives in one place rather than being duplicated per container.
 */
export interface FlowHost {
    readonly children: Node[];
    readonly width: SizeInput;
    readonly height: SizeInput;
    readonly flow: FlowMode;
    readonly gap: GapSize;
    /**
     * Alignment of children within the content box, declared loose (`Anchor`) to
     * match how containers type it; at runtime the accessor stores the resolved
     * per-axis `Vector2` pivot, which the engine reads via {@link resolvedAlign}.
     */
    readonly align: Anchor;
    /** Effective content padding (base padding plus any stroke intrusion). */
    effectivePadding(): InsetsResolved;
    /**
     * The subset of `children` this container actually positions — everything
     * except the stage-pinned ones. See `Node.flowChildren`.
     */
    flowChildren(): Node[];
    /** Measure + place the stage-pinned children this container holds. */
    layoutAbsoluteChildren(scope: Measurer): void;
}

interface FlexNodeMeasure {
    kind: "flex";
    entries: FlexMeasureEntry<FlexChild>[];
    children: Node[];
    hugWidth: number;
    hugHeight: number;
}

interface FreeformNodeMeasure {
    kind: "freeform";
    sizes: Partial<Size2D>[];
    children: Node[];
    hugWidth: number;
    hugHeight: number;
}

type NodeMeasureResult = FlexNodeMeasure | FreeformNodeMeasure;

/**
 * Flex / freeform child layout for a container node, factored out of {@link Rect}.
 *
 * Owns the measure cache and the `flow` cross-mode blend (animating between
 * `horizontal`/`vertical`/`freeform` interpolates each child's measured *and*
 * positioned box), reading everything it needs through a {@link FlowHost}. A host
 * creates one engine per node and forwards its `measure`/`layout` to it; the
 * engine exposes `flowTween` as the closure-based `flow` tween so the host can
 * register it as that prop's tween.
 */
export class FlowLayout {
    private _cachedMeasure: NodeMeasureResult | null = null;
    private _cachedMeasureFrom: NodeMeasureResult | null = null;
    private _flowBlend: { from: FlowMode; to: FlowMode; t: number } | null = null;

    constructor(private readonly host: FlowHost) {}

    // The host stores the resolved per-axis pivot in its `align` cell even though
    // it declares the prop loose; read it back as the Vector2 the layout needs.
    private resolvedAlign(): Vector2 {
        return this.host.align as Vector2;
    }

    /**
     * The `flow` prop's tween. Returns the `from` mode while a cross-mode
     * transition is mid-flight (so the measure/layout pass can interpolate the
     * two layouts) and snaps to `to` at `t >= 1`. Captures `_flowBlend`, which
     * is why `flow` can't use a static `@property` tween — the host registers
     * this via `applyProp`.
     */
    readonly flowTween = (from: FlowMode, to: FlowMode, t: number): FlowMode => {
        if (from === to) return to;
        if (t >= 1) {
            this._flowBlend = null;
            return to;
        }
        if (
            !this._flowBlend ||
            this._flowBlend.from !== from ||
            this._flowBlend.to !== to
        ) {
            this._flowBlend = { from, to, t };
        } else {
            this._flowBlend.t = t;
        }
        return from;
    };

    /** Discard the cached measure so the next layout recomputes against its bounds. */
    invalidateMeasure(): void {
        this._cachedMeasure = null;
        this._cachedMeasureFrom = null;
    }

    measure(constraints: SizeConstraints, scope: Measurer): Partial<Size2D> {
        const host = this.host;
        // Retain the scope on the host for off-tree measurement (the animated
        // child-insert in node-lifecycle.ts): Rect/Root delegate here instead of
        // Node.measure, so capture it on the host node the same way.
        (host as unknown as { _lastScope?: Measurer })._lastScope = scope;

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

        if (this._flowBlend) {
            const fromM = this.computeMeasure(this._flowBlend.from, inner.width, inner.height, scope);
            const toM = this.computeMeasure(this._flowBlend.to, inner.width, inner.height, scope);
            this._cachedMeasureFrom = fromM;
            this._cachedMeasure = toM;
            const t = this._flowBlend.t;
            hugInnerW = lerpNumber(fromM.hugWidth, toM.hugWidth, t);
            hugInnerH = lerpNumber(fromM.hugHeight, toM.hugHeight, t);
        } else {
            const m = this.computeMeasure(host.flow, inner.width, inner.height, scope);
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

    layout(rect: BoxBounds, scope: Measurer): void {
        const host = this.host;
        const padding = host.effectivePadding();
        const inner = applyPadding(rect.width, rect.height, padding);

        warnOnCollapsedCell(host, rect);

        if (this._flowBlend && this._cachedMeasure && this._cachedMeasureFrom) {
            const blend = this._flowBlend;
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
            host.layoutAbsoluteChildren(scope);
            return;
        }

        const measure = this._cachedMeasure ?? this.computeMeasure(host.flow, inner.width, inner.height, scope);
        this._cachedMeasure = null;

        const layouts = this.computeChildLayouts(host.flow, rect, measure, inner.width, inner.height, padding);
        for (let i = 0; i < measure.children.length; i++) {
            measure.children[i].layout(layouts[i], scope);
        }

        // Stage-pinned children sit outside every one of the passes above — they
        // took no part in the hug measure and get no cell from the flow — so they
        // are placed last, against the stage rather than this rect.
        host.layoutAbsoluteChildren(scope);
    }

    private computeMeasure(
        mode: FlowMode,
        innerWidth: number,
        innerHeight: number,
        scope: Measurer,
    ): NodeMeasureResult {
        if (mode === "freeform") {
            return this.computeFreeformMeasure(innerWidth, innerHeight, scope);
        }
        return this.computeFlexMeasure(flowDirection(mode), innerWidth, innerHeight, scope);
    }

    private computeChildLayouts(
        mode: FlowMode,
        rect: BoxBounds,
        measure: NodeMeasureResult,
        innerWidth: number,
        innerHeight: number,
        padding: InsetsResolved,
    ): BoxBounds[] {
        if (measure.kind === "freeform") {
            return this.computeFreeformLayouts(rect, measure, padding);
        }
        return layoutFlex({
            direction: flowDirection(mode),
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
        scope: Measurer,
    ): FlexNodeMeasure {
        const transformChildren = this.host.flowChildren();
        const adapters: FlexChild[] = transformChildren.map((child) => ({
            widthMode: child.width,
            heightMode: child.height,
            mainFlex: child.flex,
            gapScale: child.gapScale,
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

    private computeFreeformMeasure(
        innerWidth: number,
        innerHeight: number,
        scope: Measurer,
    ): FreeformNodeMeasure {
        const transformChildren = this.host.flowChildren();
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
            kind: "freeform",
            sizes,
            children: transformChildren,
            hugWidth,
            hugHeight,
        };
    }

    private computeFreeformLayouts(rect: BoxBounds, measure: FreeformNodeMeasure, pad: InsetsResolved): BoxBounds[] {
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

/**
 * Names a container that is laying out real children inside a **zero-size cell**.
 *
 * That state is always a bug and it is a quiet one. A flex run is positioned from
 * the container's own centre — start-justify is `-mainDim / 2 + padding` — so a
 * container measured 0 puts its first child's *leading edge* on its centre
 * instead of its left edge, and every child after it follows. A container with no
 * fill draws nothing itself, so what reaches the screen is the content shifted
 * down and right by half the container, over empty space. It reads as "the scene
 * loaded at 0,0" rather than as a layout fault, which is why it is worth a
 * warning naming the node rather than a silent wrong picture.
 *
 * Only fires when the children have real size — a genuinely empty container is
 * legitimately 0, and a collapsed one mid animated insert/remove is on purpose.
 * Once per node, because `layout` runs per node per frame and a warning that
 * repeats sixty times a second is one nobody can read.
 */
const warnedCollapsed = new WeakSet<object>();

function warnOnCollapsedCell(host: FlowHost, rect: BoxBounds): void {
    if (rect.width > 0 && rect.height > 0) return;
    if (warnedCollapsed.has(host)) return;

    const children = host.flowChildren();
    if (children.length === 0) return;
    const sized = children.some(
        (child) => child.measuredWidth > 0 || child.measuredHeight > 0,
    );
    if (!sized) return;

    warnedCollapsed.add(host);
    const named = host as unknown as { name?: string };
    console.warn(
        `[motion-script] "${named.name ?? "?"}" (${host.flow}) is laying out `
        + `${children.length} sized child${children.length === 1 ? "" : "ren"} in a `
        + `${rect.width}×${rect.height} cell — they will be positioned from its `
        + `centre rather than its edge.`,
        { children: children.map((c) => (c as unknown as { name?: string }).name ?? "?") },
    );
}
