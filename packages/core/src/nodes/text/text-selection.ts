import { EasingFunction } from "@/tween/ease/type";
import { TweenStepper } from "@/tween/stepper";
import { toCommand, type AnimationTarget } from "@/tween/to-command";
import { Fill } from "@/attributes/shape/fill/chain";
import { FillResolved } from "@/attributes/shape/fill/union";
import { resolveFillArray, lerpFillArray } from "@/attributes/shape/fill/registry";
import { Stroke, StrokeResolved, resolveStrokeArray } from "@/attributes/shape/stroke/mapper";
import { lerpStrokeArray } from "@/attributes/shape/stroke/lerp";
import { FontStyle } from "@/attributes/text/span";
import type { Text } from "./text-node";

/**
 * The size a selection's `fontSize` starts from on an `'autofit'` node.
 *
 * The same 100 the segmented layout probes with (`layoutTextSegments`), so a
 * selection that never touches its size reports the number that block is
 * actually shaped at rather than a second, different guess.
 */
export const AUTOFIT_PROBE_SIZE = 100;
import { type Command } from "@/tween/command";
import { command } from "@/tween/command-decorator";

/** A half-open character range `[start, end)` of a Text node's string. */
export interface TextRange {
    start: number;
    end: number;
}

/**
 * Properties a {@link TextSelection} can animate. Transform/opacity/font fields
 * are numeric; `fill`/`stroke` accept any author-facing paint and are resolved
 * before tweening (mirroring how {@link Text} resolves its own paint).
 *
 * `fontFamily` and `fontStyle` are the two that cannot tween, and they are here
 * anyway: what a selection is for is styling a run differently from its
 * neighbours, and a model that can change a word's weight but not its face is
 * one an editor has to work around rather than with. They switch at the end of a
 * step rather than interpolating - see {@link TextSelection._prepareStep} - for
 * the same reason a blend mode does: there is no half-way between two typefaces,
 * and inventing one would be a frame of text set in neither.
 */
export interface TextSelectionProps {
    opacity: number;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    fontFamily: string;
    fontSize: number;
    fontStyle: FontStyle;
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
    fontFamily: string;
    fontSize: number;
    fontStyle: FontStyle;
    fontWeight: number;
    letterSpacing: number;
    fill: FillResolved[] | null;
    stroke: StrokeResolved[] | null;
}

/** The {@link SelectionOverrides} keys that hold a string rather than a number. */
const DISCRETE_KEYS = new Set<keyof TextSelectionProps>(["fontFamily", "fontStyle"]);

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
 * textRef().find("hello").to({ opacity: 0.5, y: -10 }, 1);
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
            fontFamily: node.fontFamily,
            // `'autofit'` is a *box* decision - the size the whole block settles
            // on - so it is not a per-run value at all. A selection on an autofit
            // node starts from the probe size the segmented layout shapes with,
            // and overriding it there is what "this word, two sizes up" means.
            fontSize: typeof node.fontSize === "number" ? node.fontSize : AUTOFIT_PROBE_SIZE,
            fontStyle: node.fontStyle,
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
        const nodeSize = typeof this.node.fontSize === "number"
            ? this.node.fontSize
            : AUTOFIT_PROBE_SIZE;
        return (
            o.opacity === 1 &&
            o.x === 0 &&
            o.y === 0 &&
            o.scale === 1 &&
            o.rotation === 0 &&
            o.fontFamily === this.node.fontFamily &&
            o.fontSize === nodeSize &&
            o.fontStyle === this.node.fontStyle &&
            o.fontWeight === this.node.fontWeight &&
            o.letterSpacing === this.node.letterSpacing &&
            o.fill === null &&
            o.stroke === null
        );
    }

    /**
     * Write overrides straight onto the selection - no tween, no command.
     *
     * `to()` is the animation door and this is the *styling* one: an editor that
     * paints one word red is stating what the run **is**, not scheduling it, and
     * a zero-length `to()` would say the same thing while also landing a step on
     * the node's timeline for something that never moves. Paints are resolved
     * here exactly as `to()` resolves them, so a run styled this way and a run
     * tweened to the same value hold identical resolved arrays.
     *
     * Returns `this`, so a range and its style read as one expression.
     */
    set(props: Partial<TextSelectionProps>): this {
        const o = this.overrides;
        for (const key of Object.keys(props) as Array<keyof TextSelectionProps>) {
            const value = props[key];
            if (value === undefined) continue;
            if (key === "fill") {
                o.fill = resolveFillArray(value as Fill);
            } else if (key === "stroke") {
                o.stroke = resolveStrokeArray(value as Stroke);
            } else if (DISCRETE_KEYS.has(key)) {
                (o[key as "fontFamily" | "fontStyle"] as string) = value as string;
            } else if (typeof value === "number") {
                (o[key as "opacity"] as number) = value;
            }
        }
        return this;
    }

    @command()
    to(
        to: Partial<TextSelectionProps>,
        duration: number,
        easing?: EasingFunction,
    ): Command<TextSelectionProps> {
        return toCommand<TextSelectionProps>(this, to, duration, easing);
    }

    /**
     * Resolve one `to()` step into a flat {@link TweenStepper}. Numeric props
     * (opacity/x/y/scale/rotation/fontWeight/letterSpacing) interpolate
     * directly; `fill`/`stroke` resolve their target once and lerp via the
     * shared fill/stroke array lerps — mirroring {@link Node2D._prepareStep}.
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
            } else if (DISCRETE_KEYS.has(key)) {
                // No half-way between two faces: hold the old one until the step
                // completes, then switch. `apply(1)` runs on the seek and the
                // advance paths alike, so a scrub past the end lands on it too.
                const next = target as string;
                const previous = o[key as "fontFamily" | "fontStyle"];
                customLerps.push((t) => {
                    (o[key as "fontFamily" | "fontStyle"] as string) = t >= 1 ? next : previous;
                });
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
