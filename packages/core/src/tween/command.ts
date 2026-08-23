import { clamp01 } from "@/util/clamp";
import { EasingFunction } from "./ease/type";
import { FrameGenerator } from "./generator";
import { Steppable, TweenStepper } from "./stepper";

/**
 * A named animation that can be **evaluated** at a time as well as **run**.
 *
 * The engine's animations have always been sequential: a `FrameGenerator`
 * receives `dt` and advances, so the only way to know what a scene looks like at
 * frame N is to run it to frame N. That is the right shape for authored code —
 * `yield*` is what makes a scene read like a script — but it makes a whole class
 * of host impossible. Anything driving a timeline from *data* wants to jump: a
 * backward scrub costs a replay from zero, and frames cannot be produced out of
 * order.
 *
 * A `Command` is the same animation as a value. {@link at} is a pure function
 * from normalized time to the props it writes, so a host can ask what frame N
 * looks like without having run frames 0..N-1. `_stepper()` and
 * `[Symbol.iterator]()` are derived from it, so the two existing consumers —
 * `parallel`'s flat fast path and plain `yield*` — keep working untouched.
 *
 * Authored as a method on a node, which is what makes it nameable:
 *
 * ```ts
 * class Chart extends Node2D<ChartProps> {
 *     @command()
 *     draw(duration = 1, easing?: EasingFunction): Command<ChartProps> {
 *         const from = this.progress;
 *         return this.animate((t) => ({ progress: lerpNumber(from, 1, t) }), duration, easing);
 *     }
 * }
 *
 * // in a scene, unchanged:
 * yield* chart().draw(2);
 * ```
 *
 * **`at` is only pure once constructed.** A factory reads the node's *current*
 * props to fix its start value (`const from = this.progress` above) — which is
 * what makes chaining work, and is exactly what `_prepareStep` already does. A
 * host evaluating out of order must therefore build its commands in timeline
 * order, putting the node into the state the previous command left before
 * calling the next factory. Building is O(commands) and happens once; evaluating
 * is what happens per frame.
 */
export interface Command<P = Record<string, unknown>> extends Steppable {
    /** Seconds this command runs for. Declared, so a composite can place it. */
    readonly duration: number;
    /**
     * The props this command writes at normalized `t` ∈ [0,1], easing already
     * applied. Pure, and safe to call in any order.
     */
    at(t: number): Partial<P>;
    /** Drive it as an ordinary generator, so `yield*` and `sequence` still work. */
    [Symbol.iterator](): Iterator<void, void, number>;
}

/** True when `x` is a {@link Command} rather than a bare generator or builder. */
export function isCommand(x: unknown): x is Command {
    return typeof (x as Command)?.at === "function"
        && typeof (x as Command)?.duration === "number";
}

/** What a {@link Command} writes its evaluated props onto. */
export interface CommandTarget<P> {
    set(props: Partial<P>): void;
}

/**
 * Build a {@link Command} from a pure `t → props` function.
 *
 * The two drive paths are generated rather than written out, so they cannot
 * disagree with `at` or with each other — which was the failure mode worth
 * designing out. `TweenStepper.seek(elapsed)` already existed as an absolute-time
 * evaluator, but it wrote side-effectfully; deriving it here makes the pure
 * function the source of truth and the imperative driver the derived thing.
 *
 * @param target   Receives the evaluated props — the node the command belongs to.
 * @param at       Normalized time → props. Called with the *eased* `t`.
 * @param duration Seconds. A zero duration is a stamp: `at(1)`, immediately.
 * @param easing   Applied inside, so callers of `at` pass raw normalized time.
 */
export function makeCommand<P>(
    target: CommandTarget<P>,
    at: (t: number) => Partial<P>,
    duration: number,
    easing?: EasingFunction,
): Command<P> {
    const value = (t: number): Partial<P> => at(easing ? easing(clamp01(t)) : clamp01(t));
    return fromValue(target, duration, value);
}

/**
 * A {@link Command} whose product is a **side effect** rather than props.
 *
 * The escape hatch for state a `set` cannot reach: a node's private field, an
 * element of an array, the progress of an in-flight transition. Most of what
 * `tween(duration, fn)` was used for — and `tween` is a generator, so it was
 * also most of what kept those commands un-evaluable.
 *
 * `apply` **must be a pure function of `t`**. It is called for any `t`, in any
 * order, and more than once for the same value; unlike a generator's body it is
 * not run once per frame in sequence. Accumulating into what it writes (`x +=
 * …`) instead of assigning from `t` is the one way to misuse this, and it looks
 * correct playing forwards and drifts the instant anything scrubs.
 *
 * Built on {@link makeCommand} rather than beside it, so the stepper and the
 * iterator stay generated from one evaluator instead of being a third pair that
 * can disagree with it.
 */
export function driveCommand(
    duration: number,
    apply: (t: number) => void,
    easing?: EasingFunction,
): Command<Record<string, never>> {
    // A target that receives nothing: the writing already happened in `at`.
    const sink: CommandTarget<Record<string, never>> = { set: () => { } };
    return makeCommand(sink, (t) => {
        apply(t);
        return {};
    }, duration, easing);
}

/**
 * Run `commands` one after another as a single {@link Command}, on one node.
 *
 * This is what a node's internal choreography needs: a chart's entrance staggers
 * its axes, its gridlines and its series, and expressing that as one seekable
 * value is the difference between the whole thing being evaluable at a time and
 * only its leaves being.
 *
 * A child that has already finished is held at `at(1)` rather than dropped, so a
 * prop written early and not touched again keeps its value — the same semantics a
 * sequential run produces, without having run it. A child that has not started is
 * simply absent, which is what lets the props of a later step not exist yet.
 */
export function commandSequence<P>(
    target: CommandTarget<P>,
    ...commands: Command<P>[]
): Command<P> {
    const duration = commands.reduce((sum, c) => sum + c.duration, 0);

    return fromValue(target, duration, (t) => {
        const elapsed = t * duration;
        const props: Partial<P> = {};
        let cursor = 0;
        for (const command of commands) {
            if (elapsed < cursor) break;
            const local = command.duration > 0 ? (elapsed - cursor) / command.duration : 1;
            Object.assign(props, command.at(clamp01(local)));
            cursor += command.duration;
        }
        return props;
    });
}

/**
 * Run `commands` together as a single {@link Command}, on one node, ending when
 * the longest one does. Each starts at the group's own start.
 *
 * Later commands win where two write the same prop, matching the order they were
 * given — the same rule a sequence uses, so composing the two is predictable.
 */
export function commandParallel<P>(
    target: CommandTarget<P>,
    ...commands: Command<P>[]
): Command<P> {
    const duration = commands.reduce((max, c) => Math.max(max, c.duration), 0);

    return fromValue(target, duration, (t) => {
        const elapsed = t * duration;
        const props: Partial<P> = {};
        for (const command of commands) {
            const local = command.duration > 0 ? elapsed / command.duration : 1;
            Object.assign(props, command.at(clamp01(local)));
        }
        return props;
    });
}

/**
 * Wrap a pure `t → props` function into the full {@link Command} surface.
 *
 * Every command — leaf or composite — is built here, so all of them evaluate,
 * step and iterate the same way, and a composite is driven by *its own* merged
 * value rather than by forwarding to its children's steppers. That matters for
 * seeking: forwarding would leave each child's `elapsed` wherever the last
 * `advance` left it, and a jump backwards would read stale state.
 */
function fromValue<P>(
    target: CommandTarget<P>,
    duration: number,
    value: (t: number) => Partial<P>,
): Command<P> {
    const progress = (elapsed: number): number => (duration > 0 ? elapsed / duration : 1);

    return {
        duration,
        at: value,

        _stepper(): TweenStepper {
            let elapsed = 0;
            return {
                // Honours its argument — a stepper that can only prime at 0 is
                // not something a host can seek with.
                seek: (e: number) => {
                    elapsed = e;
                    target.set(value(progress(e)));
                },
                advance: (dt: number): boolean => {
                    elapsed += dt;
                    const done = elapsed >= duration;
                    target.set(value(done ? 1 : progress(elapsed)));
                    return done;
                },
            };
        },

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
        },
    };
}
