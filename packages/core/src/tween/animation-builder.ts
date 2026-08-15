import { FrameGenerator } from "@/tween/generator";
import { EasingFunction } from "@/tween/ease/type";
import { Steppable, TweenStepper } from "@/tween/stepper";

/** A single step in an {@link AnimationBuilder} chain. */
type ToStep<P> = { to: Partial<P>; duration: number; easing?: EasingFunction };

/**
 * Interface that a node must implement to be driven by {@link AnimationBuilder}.
 *
 * - `_toGen` — produces a {@link FrameGenerator} for one tween step (used by
 *   the iterator path: `sequence`, manual `yield*`).
 * - `_prepareStep` — produces a {@link TweenStepper} for one tween step (used
 *   by the fast path inside {@link parallel}).
 */
export interface AnimationTarget<P> {
    _toGen(props: Partial<P>, duration: number, easing?: EasingFunction): FrameGenerator;
    _prepareStep(props: Partial<P>, duration: number, easing?: EasingFunction): TweenStepper;
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
    to(props: Partial<P>, duration: number, easing?: EasingFunction): this {
        this.steps.push({ to: props, duration, easing });
        return this;
    }

    /** Total seconds across every step in the chain. */
    get duration(): number {
        return this.steps.reduce((sum, s) => sum + s.duration, 0);
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

        /**
         * Every step, prepared once, in order.
         *
         * Preparing is what snapshots a step's `from` — it reads the live node —
         * so the chain is walked through once here, landing each step on its end
         * before preparing the next. That is the same `from` a sequential run
         * would capture, and capturing it **once** is what makes a subsequent
         * seek a function of `elapsed` alone.
         *
         * Re-preparing per seek instead reads `from` off wherever the node
         * happens to be, which makes seeking backwards depend on where the
         * playhead came from: seek to 1.75s then to 0.25s and the second answer
         * is measured from the first. Built lazily, so a builder that is only
         * ever `advance`d never pays for it.
         */
        let prepared: TweenStepper[] | null = null;
        const prepareAll = (): TweenStepper[] => {
            if (prepared) return prepared;
            const out: TweenStepper[] = [];
            for (const s of steps) {
                const step = node._prepareStep(s.to, s.duration, s.easing);
                step.seek(s.duration);
                out.push(step);
            }
            prepared = out;
            return out;
        };

        return {
            /**
             * Put the chain into the state `elapsed` seconds in.
             *
             * This used to ignore its argument entirely and only prime at 0,
             * which made a chained `to().to()` advanceable but not seekable: a
             * caller asking for the state two seconds in got the state at zero.
             * A chain has always been a function of elapsed time; nothing about
             * it required running to find out.
             *
             * Steps before the one `elapsed` lands in are re-applied at their end
             * rather than skipped, so a prop an early step wrote and a later one
             * does not still holds the value it should.
             */
            seek: (elapsed: number) => {
                const list = prepareAll();
                let remaining = Math.max(0, elapsed);
                for (let i = 0; i < list.length; i++) {
                    const duration = steps[i].duration;
                    if (remaining < duration) {
                        list[i].seek(remaining);
                        return;
                    }
                    list[i].seek(duration);
                    remaining -= duration;
                }
            },
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
