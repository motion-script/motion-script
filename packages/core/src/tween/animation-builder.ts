import { FrameGenerator } from "@/tween/generator";
import { EaseFunction } from "@/tween/ease/type";
import { Steppable, TweenStepper } from "@/tween/stepper";

/** A single step in an {@link AnimationBuilder} chain. */
type ToStep<P> = { to: Partial<P>; duration: number; easing?: EaseFunction };

/**
 * Interface that a node must implement to be driven by {@link AnimationBuilder}.
 *
 * - `_toGen` — produces a {@link FrameGenerator} for one tween step (used by
 *   the iterator path: `sequence`, manual `yield*`).
 * - `_prepareStep` — produces a {@link TweenStepper} for one tween step (used
 *   by the fast path inside {@link parallel}).
 */
export interface AnimationTarget<P> {
    _toGen(props: Partial<P>, duration: number, easing?: EaseFunction): FrameGenerator;
    _prepareStep(props: Partial<P>, duration: number, easing?: EaseFunction): TweenStepper;
}

/**
 * A chainable, replayable animation description for a single node.
 *
 * Created by calling `node.to(props, duration, easing?)` on any animatable
 * node. Additional steps are appended with {@link to}, and the whole chain can
 * be passed directly to {@link sequence} or {@link parallel}.
 *
 * Implements both `Iterable<void>` (drives steps as chained generators) and
 * {@link Steppable} (drives steps as flat {@link TweenStepper}s for the
 * {@link parallel} fast-path).
 *
 * @example
 * // Animate a node to x=100 then x=0
 * const anim = node.to({ x: 100 }, 0.5).to({ x: 0 }, 0.5);
 * yield* sequence(anim);
 *
 * // Run alongside another animation
 * yield* parallel(anim, otherNode.to({ opacity: 0 }, 1));
 */
export class AnimationBuilder<P> implements Steppable {
    private steps: ToStep<P>[] = [];
    private node: AnimationTarget<P>;

    constructor(
        node: AnimationTarget<P>,
        first: ToStep<P>,
    ) {
        this.node = node;
        this.steps.push(first);
    }

    /**
     * Append another tween step to this animation chain.
     *
     * The step starts from whatever property values the node has when the
     * previous step finishes — snapshots are taken lazily at step boundaries.
     *
     * @param props    - Target property values for this step.
     * @param duration - Duration of this step in seconds.
     * @param easing   - Optional easing function (identity / linear if omitted).
     * @returns `this` for further chaining.
     */
    to(props: Partial<P>, duration: number, easing?: EaseFunction): this {
        this.steps.push({ to: props, duration, easing });
        return this;
    }

    /**
     * Flat driver over this builder's steps — no generators. Steps run in
     * sequence; each is prepared when the previous one finishes (so its `from`
     * snapshot is taken at the right time, matching the generator's `yield*`
     * chaining). {@link parallel} uses this to drive a batch of tweens in one
     * loop with zero generator resumes per item.
     */
    _stepper(): TweenStepper {
        const steps = this.steps;
        const node = this.node;
        let index = 0;
        let current: TweenStepper | null = null;

        const prime = (): TweenStepper | null => {
            if (index >= steps.length) return null;
            const s = steps[index];
            current = node._prepareStep(s.to, s.duration, s.easing);
            current.seek(0);
            return current;
        };

        return {
            seek: () => { if (!current) prime(); },
            advance: (dt: number): boolean => {
                if (!current && prime() === null) return true;
                if (!current!.advance(dt)) return false;
                // Current step finished on this frame. Apply its final value
                // (already done by advance), then start the next step at t=0 in
                // the same frame — mirrors `yield*` pulling the next generator,
                // whose seek(0) runs before its first yield.
                index++;
                current = null;
                if (prime() === null) return true;
                return false;
            },
        };
    }

    /**
     * Iterator path: yields each step as a chained generator.
     *
     * Used when the builder is passed to `yield*` directly or given to
     * {@link sequence}. {@link parallel} prefers {@link _stepper} instead.
     */
    [Symbol.iterator](): Iterator<void, void, number> {
        const steps = this.steps;
        const node = this.node;

        function* run(): FrameGenerator {
            for (const step of steps) {
                yield* node._toGen(step.to, step.duration, step.easing);
            }
        }

        return run();
    }
}
