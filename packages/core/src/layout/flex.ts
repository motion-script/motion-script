
import { BoxBounds } from "@/attributes/layout/bounds";
import { PaddingResolved } from "@/attributes/layout/padding";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { Size2D, SizeInput } from "@/attributes/layout/size";

export type FlexDirection = "row" | "column";
export type GapSize = number | "auto";

/**
 * Minimal child contract the flex strategy needs. Any object that exposes
 * a size mode per axis and can be measured under constraints qualifies —
 * the strategy never touches anything else, so it stays decoupled from
 * SceneNode/TransformNode and is reusable outside the node tree.
 */
export interface FlexChild {
    widthMode: SizeInput;
    heightMode: SizeInput;
    /**
     * Proportional weight for dividing the main-axis free space among `fill`
     * children. Only consulted when this child fills the main axis; ignored
     * otherwise. Undefined is treated as 1.
     */
    mainFlex?: number;
    measure(constraints: SizeConstraints): Partial<Size2D>;
}

export interface FlexMeasureEntry<C extends FlexChild = FlexChild> {
    child: C;
    width: number;
    height: number;
    isFlexibleMain: boolean;
    /**
     * Sanitized main-axis flex weight; 0 for non-flexible-main entries. Set by
     * `measureFlex`; `layoutFlex` never reads it, so callers that construct
     * entries directly for layout may omit it.
     */
    flex?: number;
}

export interface FlexMeasureResult<C extends FlexChild = FlexChild> {
    entries: FlexMeasureEntry<C>[];
    hugWidth: number;
    hugHeight: number;
}

export interface FlexAlignment {
    /** -1 = start, 0 = center, 1 = end (matches Vector2 convention used by FlexNode). */
    x: -1 | 0 | 1 | number;
    y: -1 | 0 | 1 | number;
}

export interface FlexMeasureInput {
    direction: FlexDirection;
    innerWidth: number;
    innerHeight: number;
    gap: GapSize;
    /** Size mode the container itself uses on each axis. Drives hug-cross anchoring. */
    parentWidthMode: SizeInput;
    parentHeightMode: SizeInput;
}

export interface FlexLayoutInput<C extends FlexChild = FlexChild> {
    direction: FlexDirection;
    entries: FlexMeasureEntry<C>[];
    /** The full container rect (post-padding-aware sizing). */
    rect: BoxBounds;
    /** Inner area width/height — outer rect minus padding. */
    innerWidth: number;
    innerHeight: number;
    gap: GapSize;
    alignment: FlexAlignment;
    padding: PaddingResolved;
}

/**
 * Pure measure pass for a flex container: measures children, distributes
 * remaining space to fill-main children, and returns hug sizes for the
 * container. Calls `child.measure()` only — no layout side effects.
 */
export function measureFlex<C extends FlexChild>(
    children: readonly C[],
    input: FlexMeasureInput,
): FlexMeasureResult<C> {
    const { direction, innerWidth, innerHeight, gap, parentWidthMode, parentHeightMode } = input;
    const mainIsRow = direction === "row";
    const mainKey: "width" | "height" = mainIsRow ? "width" : "height";
    const crossKey: "width" | "height" = mainIsRow ? "height" : "width";

    const parentMainMode = mainIsRow ? parentWidthMode : parentHeightMode;
    const parentCrossMode = mainIsRow ? parentHeightMode : parentWidthMode;
    const parentIsHugMain = parentMainMode === "hug";
    const parentIsHugCross = parentCrossMode === "hug";

    const entries: FlexMeasureEntry<C>[] = children.map((child) => {
        const isFlexibleMain = getMode(child, mainKey) === "fill";
        return {
            child,
            width: 0,
            height: 0,
            isFlexibleMain,
            flex: isFlexibleMain ? sanitizeFlex(child.mainFlex) : 0,
        };
    });

    const innerMain = mainIsRow ? innerWidth : innerHeight;
    const innerCross = mainIsRow ? innerHeight : innerWidth;

    const gapCount = Math.max(0, entries.length - 1);
    const totalGap = gap === "auto" ? 0 : gap * gapCount;
    const flexibleCount = entries.filter((e) => e.isFlexibleMain).length;

    // Pass 1a: measure fixed-main + fixed-cross children to establish maxCross anchor.
    let fixedMain = 0;
    let maxCrossAnchor = 0;
    for (const entry of entries) {
        if (entry.isFlexibleMain) continue;
        const crossMode = getMode(entry.child, crossKey);
        if (parentIsHugCross && crossMode === "fill") continue; // deferred to pass 1b
        const size = entry.child.measure({ maxWidth: innerWidth, maxHeight: innerHeight });
        entry.width = size.width ?? 0;
        entry.height = size.height ?? 0;
        fixedMain += mainIsRow ? entry.width : entry.height;
        const childCross = mainIsRow ? entry.height : entry.width;
        if (childCross > maxCrossAnchor) maxCrossAnchor = childCross;
    }

    // Pass 1b: fixed-main children whose cross is "fill" when parent hugs cross.
    const innerCrossForFillCross = parentIsHugCross ? maxCrossAnchor : innerCross;
    for (const entry of entries) {
        if (entry.isFlexibleMain) continue;
        const crossMode = getMode(entry.child, crossKey);
        if (!(parentIsHugCross && crossMode === "fill")) continue;
        const size = entry.child.measure({ maxWidth: innerWidth, maxHeight: innerHeight });
        if (mainIsRow) {
            entry.width = size.width ?? 0;
            entry.height = innerCrossForFillCross;
            fixedMain += entry.width;
        } else {
            entry.width = innerCrossForFillCross;
            entry.height = size.height ?? 0;
            fixedMain += entry.height;
        }
    }

    // Pass 2: distribute remaining space to flexible-main children, weighted by
    // each child's flex. The total to divide is the same as before; only how it
    // splits between fill children changes (equal weights → equal split).
    const distributable = parentIsHugMain
        ? fixedMain
        : Math.max(0, innerMain - totalGap - fixedMain);
    let sumFlex = 0;
    for (const entry of entries) {
        if (entry.isFlexibleMain) sumFlex += entry.flex ?? 1;
    }

    const innerCrossForFillMain = parentIsHugCross ? maxCrossAnchor : innerCross;

    for (const entry of entries) {
        if (!entry.isFlexibleMain) continue;
        const share = sumFlex > 0 ? distributable * ((entry.flex ?? 1) / sumFlex) : 0;
        const measured = entry.child.measure(
            mainIsRow
                ? { maxWidth: share, maxHeight: innerHeight }
                : { maxWidth: innerWidth, maxHeight: share },
        );
        const crossMode = getMode(entry.child, crossKey);
        if (mainIsRow) {
            entry.width = share;
            entry.height = crossMode === "fill" ? innerCrossForFillMain : (measured.height ?? 0);
        } else {
            entry.width = crossMode === "fill" ? innerCrossForFillMain : (measured.width ?? 0);
            entry.height = share;
        }
    }

    let totalMain = 0;
    let maxCross = 0;
    for (const entry of entries) {
        const childMain = mainIsRow ? entry.width : entry.height;
        const childCross = mainIsRow ? entry.height : entry.width;
        totalMain += childMain;
        if (childCross > maxCross) maxCross = childCross;
    }

    const hugMain =
        parentIsHugMain && flexibleCount > 0 ? fixedMain + totalGap : totalMain + totalGap;

    return mainIsRow
        ? { entries, hugWidth: hugMain, hugHeight: maxCross }
        : { entries, hugWidth: maxCross, hugHeight: hugMain };
}

/**
 * Pure layout pass for a flex container: given measured entries and a rect,
 * returns the local bounds for each child (centered coordinates).
 */
export function layoutFlex<C extends FlexChild>(input: FlexLayoutInput<C>): BoxBounds[] {
    const { direction, entries, rect, innerWidth, innerHeight, gap, alignment, padding } = input;
    const mainIsRow = direction === "row";

    const childrenMain = entries.reduce(
        (sum, entry) => sum + (mainIsRow ? entry.width : entry.height),
        0,
    );

    const mainDim = mainIsRow ? rect.width : rect.height;
    const innerMain = mainIsRow ? innerWidth : innerHeight;
    const crossDim = mainIsRow ? rect.height : rect.width;

    const gapCount = Math.max(0, entries.length - 1);
    const effectiveGap =
        gap === "auto"
            ? gapCount > 0
                ? Math.max(0, innerMain - childrenMain) / gapCount
                : 0
            : gap;

    const totalMain = childrenMain + effectiveGap * gapCount;

    const justify = mainIsRow
        ? alignment.x === -1
            ? "start"
            : alignment.x === 0
                ? "center"
                : "end"
        : alignment.y === 1
            ? "start"
            : alignment.y === 0
                ? "center"
                : "end";

    const align = mainIsRow
        ? alignment.y === 1
            ? "start"
            : alignment.y === 0
                ? "center"
                : "end"
        : alignment.x === -1
            ? "start"
            : alignment.x === 0
                ? "center"
                : "end";

    let mainPos: number;
    if (mainIsRow) {
        if (justify === "start") mainPos = -mainDim / 2 + padding.left;
        else if (justify === "center") mainPos = -totalMain / 2;
        else mainPos = mainDim / 2 - totalMain - padding.right;
    } else {
        if (justify === "start") mainPos = -mainDim / 2 + padding.top;
        else if (justify === "center") mainPos = -totalMain / 2;
        else mainPos = mainDim / 2 - totalMain - padding.bottom;
    }

    const result: BoxBounds[] = [];
    for (const entry of entries) {
        const childMain = mainIsRow ? entry.width : entry.height;
        const childCross = mainIsRow ? entry.height : entry.width;

        let crossPos: number;
        if (mainIsRow) {
            if (align === "start") crossPos = -crossDim / 2 + childCross / 2 + padding.top;
            else if (align === "center") crossPos = 0;
            else crossPos = crossDim / 2 - childCross / 2 - padding.bottom;
        } else {
            if (align === "start") crossPos = -crossDim / 2 + childCross / 2 + padding.left;
            else if (align === "center") crossPos = 0;
            else crossPos = crossDim / 2 - childCross / 2 - padding.right;
        }

        const localX = mainIsRow ? mainPos + childMain / 2 : crossPos;
        const localY = mainIsRow ? crossPos : mainPos + childMain / 2;

        result.push({
            x: localX,
            y: localY,
            width: entry.width,
            height: entry.height,
        });

        mainPos += childMain + effectiveGap;
    }
    return result;
}

function getMode(child: FlexChild, axis: "width" | "height"): SizeInput {
    return axis === "width" ? child.widthMode : child.heightMode;
}

/** Coerce a flex weight to a usable non-negative number; undefined/invalid → 1. */
function sanitizeFlex(value: number | undefined): number {
    if (value == null) return 1;
    return Number.isFinite(value) && value >= 0 ? value : 1;
}
