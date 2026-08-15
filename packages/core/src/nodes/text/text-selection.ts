import { EasingFunction } from "@/tween/ease/type";
import { TweenStepper } from "@/tween/stepper";
import { toChain, type AnimationTarget, type ChainableCommand } from "@/tween/chain";
import { Fill } from "@/attributes/shape/fill/chain";
import { FillResolved } from "@/attributes/shape/fill/union";
import { resolveFillArray, lerpFillArray } from "@/attributes/shape/fill/registry";
import { Stroke, StrokeResolved, resolveStrokeArray } from "@/attributes/shape/stroke/mapper";
import { lerpStrokeArray } from "@/attributes/shape/stroke/lerp";
import type { Text } from "./text-node";

/** A half-open character range `[start, end)` of a Text node's string. */
export interface TextRange {
    start: number;
    end: number;
}

/**
 * Properties a {@link TextSelection} can animate. Transform/opacity/font fields
 * are numeric; `fill`/`stroke` accept any author-facing paint and are resolved
 * before tweening (mirroring how {@link Text} resolves its own paint).
 */
export interface TextSelectionProps {
    opacity: number;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    fontWeight: number;
    letterSpacing: number;
    fill: Fill;
    stroke: Stroke;
}

/**
 * Live, resolved override state for a selection, read by the Text node each
 * frame to build per-piece segments. `fill`/`stroke` are `null` until set,
 * meaning "inherit the node's paint".
 */
export interface SelectionOverrides {
    opacity: number;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    fontWeight: number;
    letterSpacing: number;
    fill: FillResolved[] | null;
    stroke: StrokeResolved[] | null;
}

/**
 * A sub-range of a {@link Text} node's glyphs that can be animated
 * independently. Returned by the node's selector methods (`find`, `match`,
 * `line`, `word`, `words`, `slice`, `filter`).
 *
 * Implements {@link AnimationTarget} so `selection.to({ ... }, duration)`
 * plugs straight into the existing `Command` / `parallel` / `sequence`
 * machinery — each tween writes resolved values into {@link overrides}, which
 * the node reads when splitting its text into rendered pieces.
 *
 * @example
 * yield* textRef().find("hello").to({ opacity: 0.5, y: -10 }, 1);
 */
export class TextSelection implements AnimationTarget<TextSelectionProps> {
    readonly node: Text;
    readonly ranges: TextRange[];

    /**
     * Current resolved overrides for this selection. Numeric fields default to
     * the node's current values (so a partial tween starts from the node's
     * style); `fill`/`stroke` start as `null` (inherit) until tweened.
     */
    readonly overrides: SelectionOverrides;

    constructor(node: Text, ranges: TextRange[]) {
        this.node = node;
        this.ranges = normalizeRanges(ranges, node.text.length);
        this.overrides = {
            opacity: 1,
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            fontWeight: node.fontWeight,
            letterSpacing: node.letterSpacing,
            fill: null,
            stroke: null,
        };
        node._registerSelection(this);
    }

    /** True when this selection has no overrides differing from the node default. */
    get isIdentity(): boolean {
        const o = this.overrides;
        return (
            o.opacity === 1 &&
            o.x === 0 &&
            o.y === 0 &&
            o.scale === 1 &&
            o.rotation === 0 &&
            o.fontWeight === this.node.fontWeight &&
            o.letterSpacing === this.node.letterSpacing &&
            o.fill === null &&
            o.stroke === null
        );
    }

    to(
        to: Partial<TextSelectionProps>,
        duration: number,
        easing?: EasingFunction,
    ): ChainableCommand<TextSelectionProps> {
        return toChain<TextSelectionProps>(this, to, duration, easing);
    }

    /**
     * Resolve one `to()` step into a flat {@link TweenStepper}. Numeric props
     * (opacity/x/y/scale/rotation/fontWeight/letterSpacing) interpolate
     * directly; `fill`/`stroke` resolve their target once and lerp via the
     * shared fill/stroke array lerps — mirroring {@link Node._prepareStep}.
     */
    _prepareStep(
        to: Partial<TextSelectionProps>,
        duration: number,
        easing?: EasingFunction,
    ): TweenStepper {
        const o = this.overrides;
        const numeric: Array<{ key: keyof SelectionOverrides; from: number; to: number }> = [];
        const customLerps: Array<(t: number) => void> = [];

        for (const key of Object.keys(to) as Array<keyof TextSelectionProps>) {
            const target = to[key];
            if (target === undefined) continue;

            if (key === 'fill') {
                const from = o.fill ?? (this.node.fill as FillResolved[]);
                const resolved = resolveFillArray(target as Fill);
                customLerps.push((t) => { o.fill = lerpFillArray(from, resolved, t); });
            } else if (key === 'stroke') {
                const from = o.stroke ?? (this.node.stroke as StrokeResolved[]);
                const resolved = resolveStrokeArray(target as Stroke);
                customLerps.push((t) => { o.stroke = lerpStrokeArray(from, resolved, t); });
            } else if (typeof target === 'number') {
                const k = key as keyof SelectionOverrides;
                numeric.push({ key: k, from: o[k] as number, to: target });
            }
        }

        const apply = (t: number): void => {
            const easedT = easing ? easing(t) : t;
            for (const n of numeric) {
                (o[n.key] as number) = n.from + (n.to - n.from) * easedT;
            }
            for (const fn of customLerps) fn(easedT);
        };

        let elapsed = 0;
        return {
            seek: (e: number) => apply(duration > 0 ? Math.min(e / duration, 1) : 1),
            advance: (dt: number): boolean => {
                elapsed += dt;
                if (elapsed < duration) {
                    apply(elapsed / duration);
                    return false;
                }
                apply(1);
                return true;
            },
        };
    }
}

/**
 * Clamp ranges to `[0, length]`, drop empties, sort by start, and merge any
 * that touch or overlap so each glyph is covered once per selection. The
 * relative order selections were *created* in is preserved across selections by
 * the node's registry, not here.
 */
export function normalizeRanges(ranges: TextRange[], length: number): TextRange[] {
    const clamped = ranges
        .map(r => ({ start: Math.max(0, Math.min(r.start, length)), end: Math.max(0, Math.min(r.end, length)) }))
        .filter(r => r.end > r.start)
        .sort((a, b) => a.start - b.start);

    const merged: TextRange[] = [];
    for (const r of clamped) {
        const last = merged[merged.length - 1];
        if (last && r.start <= last.end) {
            last.end = Math.max(last.end, r.end);
        } else {
            merged.push({ ...r });
        }
    }
    return merged;
}
