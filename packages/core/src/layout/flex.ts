
import { BoxBounds } from "@/attributes/layout/bounds";
import { InsetsResolved } from "@/attributes/layout/insets";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { Size2D, SizeInput } from "@/attributes/layout/size";
import { clamp } from "@/util/clamp";

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
    /**
     * Per-child gap weight in `[0, 1]` for animated insert/remove: the fraction
     * of a full gap this child contributes on each of its sides. Undefined → 1
     * (normal layout). The animated `addChildAt`/`removeChildAt` overloads tween
     * this `0 ↔ 1` so a collapsing/growing child opens or closes exactly one
     * gap's worth of space in lockstep with its box.
     */
    gapScale?: number;
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
    /**
     * Sanitized per-child gap weight in `[0, 1]` (see {@link FlexChild.gapScale}).
     * Set by `measureFlex` so `layoutFlex` — which receives entries, not children
     * — can weight the gaps around this child without re-reading the child.
     * Undefined → treated as 1 by both passes.
     */
    gapScale?: number;
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
    padding: InsetsResolved;
    /**
     * The container's name, for {@link warnOnCollapsedRun}'s diagnostic only.
     * Nothing about the layout reads it.
     */
    debugName?: string;
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
    const parentIsHugCross = parentCrossMode === "hug";

    const entries: FlexMeasureEntry<C>[] = children.map((child) => {
        const isFlexibleMain = getMode(child, mainKey) === "fill";
        return {
            child,
            width: 0,
            height: 0,
            isFlexibleMain,
            flex: isFlexibleMain ? sanitizeFlex(child.mainFlex) : 0,
            gapScale: sanitizeGapScale(child.gapScale),
        };
    });

    const parentIsHugMain = parentMainMode === "hug";

    const innerMain = mainIsRow ? innerWidth : innerHeight;
    const innerCross = mainIsRow ? innerHeight : innerWidth;

    // Gap budget driven by the sum of per-child gap weights rather than a flat
    // `(count - 1)`. With every child at the default weight 1 this is exactly
    // `gap * (count - 1)` (unchanged). A single child collapsing to weight 0
    // (mid animated insert/remove) removes exactly one gap's worth from the
    // budget — regardless of the child's index — so a hug container's size and
    // the space left for `fill` siblings both track the animation smoothly.
    let scaleSum = 0;
    for (const entry of entries) scaleSum += entry.gapScale ?? 1;
    const totalGap = gap === "auto" ? 0 : gap * Math.max(0, scaleSum - 1);

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
    //
    // When the parent hugs main, there's no real "remaining space" to divide —
    // mirrors Figma, which disallows "Fill container" on the axis a parent
    // hugs. A fill-main child here measures unconstrained, like a hug child,
    // and contributes its own intrinsic size to the hug total instead of an
    // arbitrary borrowed share.
    const distributable = Math.max(0, innerMain - totalGap - fixedMain);
    let sumFlex = 0;
    for (const entry of entries) {
        if (entry.isFlexibleMain) sumFlex += entry.flex ?? 1;
    }

    const innerCrossForFillMain = parentIsHugCross ? maxCrossAnchor : innerCross;

    for (const entry of entries) {
        if (!entry.isFlexibleMain) continue;
        const crossMode = getMode(entry.child, crossKey);
        if (parentIsHugMain) {
            // No real remaining space to give a main-axis fill child here, so
            // measure its main axis unconstrained (like a hug child) rather
            // than handing it 0 via a missing/defaulted constraint. That's
            // correct for a child with genuine intrinsic content (e.g.
            // wrapping Text reports its real wrapped size even unconstrained)
            // — but a child with no intrinsic size of its own (a bare
            // `fill`-mode leaf) just echoes back "unconstrained" as Infinity.
            // This combination normally can't arise from an unspecified
            // default (Rect/FlexNode default their own main-axis mode to
            // "fill" whenever a direct child requests fill on that axis — see
            // applyDefaultSize), but an explicit author override (`width:
            // 'hug'` alongside a fill child) can still reach it — clamp to 0
            // rather than propagate Infinity into the container's hug size.
            const measured = entry.child.measure(
                mainIsRow
                    ? { maxWidth: Infinity, maxHeight: innerHeight }
                    : { maxWidth: innerWidth, maxHeight: Infinity },
            );
            const measuredMain = (mainIsRow ? measured.width : measured.height) ?? 0;
            const mainSize = Number.isFinite(measuredMain) ? measuredMain : 0;
            if (mainIsRow) {
                entry.width = mainSize;
                entry.height = crossMode === "fill" ? innerCrossForFillMain : (measured.height ?? 0);
            } else {
                entry.width = crossMode === "fill" ? innerCrossForFillMain : (measured.width ?? 0);
                entry.height = mainSize;
            }
            continue;
        }
        const share = sumFlex > 0 ? distributable * ((entry.flex ?? 1) / sumFlex) : 0;
        const measured = entry.child.measure(
            mainIsRow
                ? { maxWidth: share, maxHeight: innerHeight }
                : { maxWidth: innerWidth, maxHeight: share },
        );
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

    const hugMain = totalMain + totalGap;

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

    warnOnCollapsedRun(input, mainIsRow);

    const childrenMain = entries.reduce(
        (sum, entry) => sum + (mainIsRow ? entry.width : entry.height),
        0,
    );

    const mainDim = mainIsRow ? rect.width : rect.height;
    const innerMain = mainIsRow ? innerWidth : innerHeight;
    const crossDim = mainIsRow ? rect.height : rect.width;

    // Per-child gap weighting for smooth animated insert/remove. Each boundary
    // between child i and i+1 gets `gap * (scale_i + scale_{i+1}) / 2` — the
    // average of its two neighbours' weights. The whole run occupies
    // `totalGap = gap * max(0, Σscale − 1)`, exactly matching the budget
    // `measureFlex` reserves, so the container's own size and the run's extent
    // stay in agreement every frame. `startBias` shifts a start-justified run
    // left by the leading child's collapsed half-gap so the *existing* content
    // edge holds still while an inserted first child grows in from width 0 — the
    // average weighting alone would otherwise nudge every sibling by half a gap
    // at the instant of insertion. With every weight 1 (the normal case),
    // `boundaryGap = gap`, `startBias = 0`, and `totalGap = gap * (count − 1)` —
    // identical to the pre-`gapScale` behaviour.
    const n = entries.length;
    // Bounds-safe: an out-of-range index is a phantom off-the-end neighbour with
    // full weight. Only reached for the trailing `boundaryGap(n - 1)` the loop
    // computes but discards (no child follows the last one), so its value never
    // affects a real position; keeping it defined just avoids an undefined read.
    const gapScaleAt = (i: number): number =>
        i >= 0 && i < n ? entries[i].gapScale ?? 1 : 1;
    const autoGapCount = Math.max(0, n - 1);
    let boundaryGap: (i: number) => number;
    let totalGap: number;
    let startBias = 0;
    if (gap === "auto") {
        const effectiveGap =
            autoGapCount > 0 ? Math.max(0, innerMain - childrenMain) / autoGapCount : 0;
        boundaryGap = () => effectiveGap;
        totalGap = effectiveGap * autoGapCount;
    } else {
        boundaryGap = (i: number) => gap * (gapScaleAt(i) + gapScaleAt(i + 1)) / 2;
        let scaleSum = 0;
        for (let i = 0; i < n; i++) scaleSum += gapScaleAt(i);
        totalGap = gap * Math.max(0, scaleSum - 1);
        startBias = n > 0 ? -gap * (1 - gapScaleAt(0)) / 2 : 0;
    }

    const totalMain = childrenMain + totalGap;

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

    // Start-justify pins the first child's leading edge, so a collapsing leading
    // child (mid animated insert/remove) would otherwise slide every sibling by
    // half a gap. `startBias` (≤ 0) shifts the run left by that collapsed leading
    // half-gap so the existing content edge holds still. Center/end justify
    // derive from `totalMain` and stay put on their own; `startBias` is 0 unless
    // the first child's weight is below 1.
    if (justify === "start") mainPos += startBias;

    const result: BoxBounds[] = [];
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const childMain = mainIsRow ? entry.width : entry.height;
        const childCross = mainIsRow ? entry.height : entry.width;

        let crossPos: number;
        if (mainIsRow) {
            if (align === "start") crossPos = -crossDim / 2 + childCross / 2 + padding.top;
            // Center on the *padded* inner area, not the box: asymmetric padding
            // shifts the inner center by (top - bottom) / 2 (matches applyPadding).
            else if (align === "center") crossPos = (padding.top - padding.bottom) / 2;
            else crossPos = crossDim / 2 - childCross / 2 - padding.bottom;
        } else {
            if (align === "start") crossPos = -crossDim / 2 + childCross / 2 + padding.left;
            else if (align === "center") crossPos = (padding.left - padding.right) / 2;
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

        mainPos += childMain + boundaryGap(i);
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

/**
 * Coerce a per-child gap weight to `[0, 1]`; undefined/invalid → 1 (full gap).
 * Clamped so an eased tween that momentarily overshoots its 0↔1 endpoints can't
 * push a gap negative or past full width.
 */
function sanitizeGapScale(value: number | undefined): number {
    if (value == null) return 1;
    return Number.isFinite(value) ? clamp(value, 0, 1) : 1;
}

/** Containers already reported, so a per-frame layout can't spam the console. */
const warnedCollapsed = new Set<string>();

/**
 * Names a container laying out **sized children in a zero-length run**.
 *
 * Always a bug, and a quiet one. A run is positioned from the container's own
 * centre — start-justify is `-mainDim / 2 + padding` — so a container whose main
 * axis measured 0 puts its first child's *leading* edge on its centre instead of
 * its leading edge, and every child after it follows. A container with no fill
 * draws nothing itself, so what reaches the screen is the content displaced by
 * half the container over empty space. It reads as "the scene loaded at 0,0"
 * rather than as a layout fault.
 *
 * Deliberately here rather than in `FlowLayout`, and deliberately keyed on
 * `entries` rather than on the children's `measuredWidth`. Both of those were the
 * first attempt and both were blind exactly where it matters: `Column`/`Row` are
 * `FlexNode`s that call this directly and never touch `FlowLayout`, and
 * `measuredWidth` reads a `layoutRect` that has not been assigned yet on the
 * first pass — which is the pass where this goes wrong. `entries` carry the sizes
 * the measure pass just computed, so they are true on the first frame.
 */
function warnOnCollapsedRun<C extends FlexChild>(
    input: FlexLayoutInput<C>,
    mainIsRow: boolean,
): void {
    const mainDim = mainIsRow ? input.rect.width : input.rect.height;
    if (mainDim > 0) return;
    if (input.entries.length === 0) return;

    // Children that measured to something. A container holding only collapsed
    // children is legitimately zero — that is an animated insert/remove mid-flight.
    const sized = input.entries.filter((e) => e.width > 0 || e.height > 0);
    if (sized.length === 0) return;

    const name = input.debugName ?? "?";
    if (warnedCollapsed.has(name)) return;
    warnedCollapsed.add(name);

    console.warn(
        `[motion-script] "${name}" is laying out ${sized.length} sized child`
        + `${sized.length === 1 ? "" : "ren"} in a run of length 0 `
        + `(rect ${input.rect.width}×${input.rect.height}, ${mainIsRow ? "row" : "column"}). `
        + `They will be positioned from its centre rather than its leading edge.`,
        { sizes: sized.map((e) => `${e.width}×${e.height}`) },
    );
}
