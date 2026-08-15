import { clamp01 } from "@/util/clamp";
import { EasingFunction } from "@/tween/ease/type";
import { FrameGenerator } from "@/tween/generator";
import { Steppable, TweenStepper } from "@/tween/stepper";
import { Command } from "./command";

/** A single step in a {@link ChainableCommand}'s chain. */
type ToStep<P> = { to: Partial<P>; duration: number; easing?: EasingFunction };

/**
 * Interface that a node (or other host) must implement to be driven by
 * {@link toChain}/{@link ChainableCommand}.
 *
 * `_prepareStep` resolves one tween step into a flat, mutation-driving
 * {@link TweenStepper} — the same primitive both the flat `parallel` fast path
 * and a chain's own evaluation are built from.
 */
export interface AnimationTarget<P> {
    _prepareStep(props: Partial<P>, duration: number, easing?: EasingFunction): TweenStepper;
}

/**
 * A {@link Command} that can be extended with another step via {@link to},
 * chaining sequential tweens on one target — `node.to({ x: 100 }, 1).to({ x: 0 }, 1)`.
 */
export interface ChainableCommand<P> extends Command<P> {
    /**
     * Append another tween step, starting from wherever this chain's previous
     * step ends. Mutates and returns `this`, matching the fluent chain a scene
     * author writes inline.
     */
    to(props: Partial<P>, duration: number, easing?: EasingFunction): ChainableCommand<P>;
}

/**
 * Advance `list` (steppers already prepared 1:1 against `steps`) to `elapsed`
 * seconds into the chain: steps before the target are left at their end,
 * matching the value a sequential run would have captured.
 */
function seekChain<P>(steps: ToStep<P>[], list: TweenStepper[], elapsed: number): void {
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
}

/**
 * A chainable, replayable, evaluable animation for a single target — what
 * {@link ChainableCommand} actually is. Created by `node.to(...)`.
 *
 * Implements {@link Command} (so a host can ask what it looks like at a time),
 * {@link Steppable} (the flat driver `parallel`'s fast path and motion-studio's
 * driven timeline rely on), and `Iterable<void>` (`yield*`/`sequence`).
 *
 * `at`/`_stepper`/`[Symbol.iterator]` each keep their **own** prepared-steppers
 * cache rather than sharing one: a chain handed to `parallel` while also being
 * seeked by a driven host must not have the two drivers fight over the same
 * mutable stepper state.
 */
class NodeChain<P> implements ChainableCommand<P>, Steppable {
    private steps: ToStep<P>[] = [];
    private target: AnimationTarget<P>;
    private atPrepared: TweenStepper[] | null = null;

    constructor(target: AnimationTarget<P>, first: ToStep<P>) {
        this.target = target;
        this.steps.push(first);
    }

    to(props: Partial<P>, duration: number, easing?: EasingFunction): ChainableCommand<P> {
        this.steps.push({ to: props, duration, easing });
        this.atPrepared = null;
        return this;
    }

    get duration(): number {
        return this.steps.reduce((sum, s) => sum + s.duration, 0);
    }

    /**
     * Prepare every step once, in order — priming is what snapshots a step's
     * `from` (it reads the live target), so walking the chain once here, each
     * step landing on its end before the next is prepared, captures the same
     * `from` a sequential run would.
     */
    private prepareAll(): TweenStepper[] {
        const out: TweenStepper[] = [];
        for (const s of this.steps) {
            const step = this.target._prepareStep(s.to, s.duration, s.easing);
            step.seek(s.duration);
            out.push(step);
        }
        return out;
    }

    /**
     * The props this chain writes at normalized `t`. Applied as a side effect
     * (direct cell writes via each step's prepared stepper, exactly like
     * `driveCommand`) rather than returned — a chain step may carry a custom
     * tween function or a mapped prop, which only the target's own
     * `_prepareStep` knows how to apply correctly.
     */
    at(t: number): Partial<P> {
        if (!this.atPrepared) this.atPrepared = this.prepareAll();
        seekChain(this.steps, this.atPrepared, clamp01(t) * this.duration);
        return {};
    }

    /**
     * Flat driver over this chain's steps — no generators. Each call gets its
     * own independent prepared-steppers cache, so multiple concurrent drivers
     * (e.g. a `parallel` run alongside a direct `.at()` probe) don't share
     * mutable stepper state.
     */
    _stepper(): TweenStepper {
        const steps = this.steps;
        const target = this.target;
        let index = 0;
        let current: TweenStepper | null = null;
        let prepared: TweenStepper[] | null = null;

        const prime = (): TweenStepper | null => {
            if (index >= steps.length) return null;
            const s = steps[index];
            current = target._prepareStep(s.to, s.duration, s.easing);
            current.seek(0);
            return current;
        };

        return {
            seek: (elapsed: number) => {
                if (!prepared) prepared = this.prepareAll();
                seekChain(steps, prepared, elapsed);
            },
            advance: (dt: number): boolean => {
                if (!current && prime() === null) return true;
                if (!current!.advance(dt)) return false;
                // Current step finished this frame — apply the next step at
                // t=0 in the same frame, mirroring `yield*` pulling the next
                // generator (whose seek(0) runs before its first yield).
                index++;
                current = null;
                if (prime() === null) return true;
                return false;
            },
        };
    }

    [Symbol.iterator](): Iterator<void, void, number> {
        const step = this._stepper();
        return (function* (): FrameGenerator {
            step.seek(0);
            let done = false;
            while (!done) {
                const dt = yield;
                done = step.advance(dt);
            }
        })();
    }
}

/** Build a {@link ChainableCommand} — the return value of `node.to(...)`. */
export function toChain<P>(
    target: AnimationTarget<P>,
    props: Partial<P>,
    duration: number,
    easing?: EasingFunction,
): ChainableCommand<P> {
    return new NodeChain<P>(target, { to: props, duration, easing });
}
