import { clamp01 } from "@/util/clamp";
import { EasingFunction } from "@/tween/ease/type";
import { FrameGenerator } from "@/tween/generator";
import { Steppable, TweenStepper } from "@/tween/stepper";
import { Command } from "./command";

/**
 * Interface a node (or other host) implements to be driven by {@link toCommand}.
 *
 * `_prepareStep` resolves one tween into a flat, mutation-driving
 * {@link TweenStepper} — the same primitive both the flat `parallel` fast path
 * and the command's own evaluation are built from.
 */
export interface AnimationTarget<P> {
    _prepareStep(props: Partial<P>, duration: number, easing?: EasingFunction): TweenStepper;
}

/**
 * The {@link Command} `node.to(...)` returns: one tween on one target, and
 * nothing else.
 *
 * **Single, not chainable.** `to()` used to return a builder whose own `to()`
 * appended another step and returned `this`, so `node.to(a, 1).to(b, 1)` read as
 * a sequence. It was a second way to spell {@link sequence} that only worked for
 * one node and only for prop tweens — a named command could not join a chain,
 * and a chain could not be composed with anything else. One command shape means
 * `sequence` and `parallel` compose everything uniformly, and a host reading a
 * `Command` off a node knows what it holds.
 *
 * Implements {@link Command} (a host can ask what it looks like at a time),
 * {@link Steppable} (the flat driver `parallel` uses) and `Iterable<void>`
 * (`yield*`).
 *
 * `at` / `_stepper` / `[Symbol.iterator]` each keep their **own** prepared
 * stepper: preparing is what snapshots the tween's `from` (it reads the live
 * target), and a command handed to `parallel` while also being seeked by a
 * driven host must not have the two drivers fight over one mutable stepper.
 */
class ToCommand<P> implements Command<P>, Steppable {
    private atPrepared: TweenStepper | null = null;

    constructor(
        private readonly target: AnimationTarget<P>,
        private readonly props: Partial<P>,
        readonly duration: number,
        private readonly easing?: EasingFunction,
    ) { }

    /**
     * The props this command writes at normalized `t`. Applied as a side effect
     * (direct cell writes through the prepared stepper, exactly like
     * `driveCommand`) rather than returned — a tween may carry a custom tween
     * function or a mapped prop, and only the target's own `_prepareStep` knows
     * how to apply those correctly.
     */
    at(t: number): Partial<P> {
        if (!this.atPrepared) this.atPrepared = this.prepare();
        this.atPrepared.seek(clamp01(t) * this.duration);
        return {};
    }

    _stepper(): TweenStepper {
        return this.prepare();
    }

    [Symbol.iterator](): Iterator<void, void, number> {
        const step = this.prepare();
        return (function* (): FrameGenerator {
            step.seek(0);
            let done = false;
            while (!done) {
                const dt = yield;
                done = step.advance(dt);
            }
        })();
    }

    private prepare(): TweenStepper {
        return this.target._prepareStep(this.props, this.duration, this.easing);
    }
}

/** Build the {@link Command} `node.to(...)` returns. */
export function toCommand<P>(
    target: AnimationTarget<P>,
    props: Partial<P>,
    duration: number,
    easing?: EasingFunction,
): Command<P> {
    return new ToCommand<P>(target, props, duration, easing);
}
