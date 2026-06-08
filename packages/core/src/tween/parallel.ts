import { FrameGenerator } from "@/tween/generator";
import { isSteppable, TweenStepper } from "@/tween/stepper";

/**
 * Runs multiple animations simultaneously, finishing when all of them complete.
 *
 * **Performance fast-path:** animations that implement {@link Steppable}
 * (e.g. an {@link AnimationBuilder} returned by `node.to(...)`) are driven as
 * flat {@link TweenStepper}s — no generator resumes per item. This makes
 * `parallel` efficient even with hundreds of concurrent node tweens.
 *
 * All other animations (nested `parallel`/`sequence`, `wait`, custom
 * generators) are driven normally as iterators.
 *
 * @param animations - Animations to run at the same time.
 *
 * @example
 * yield* parallel(
 *   nodeA.to({ x: 200 }, 0.6),
 *   nodeB.to({ opacity: 0 }, 0.4),
 *   wait(0.6),
 * );
 */
export function* parallel(
    ...animations: (FrameGenerator | Iterable<void>)[]
): FrameGenerator {
    if (animations.length === 0) return;

    // Split into flat steppers (simple node tweens) and generators (everything
    // else: wait, nested parallel/sequence, custom generators). Steppers are
    // driven in a tight loop with no per-item generator resume — the big win
    // when a parallel holds hundreds of node.to() animations.
    const steppers: TweenStepper[] = [];
    const active: Iterator<void, void, number>[] = [];
    for (const a of animations) {
        if (isSteppable(a)) {
            steppers.push(a._stepper());
        } else {
            active.push(
                Symbol.iterator in a
                    ? (a as Iterable<void>)[Symbol.iterator]() as Iterator<void, void, number>
                    : a as Iterator<void, void, number>,
            );
        }
    }

    // Prime: apply each item's t=0 value before the first yield, matching the
    // old loop where the first next(undefined) ran ahead of any dt.
    for (const s of steppers) s.seek(0);
    let g = 0;
    while (g < active.length) {
        if (active[g].next(undefined as any).done) {
            active[g] = active[active.length - 1];
            active.pop();
        } else {
            g++;
        }
    }

    while (steppers.length > 0 || active.length > 0) {
        const dt = yield;

        let i = 0;
        while (i < steppers.length) {
            if (steppers[i].advance(dt)) {
                steppers[i] = steppers[steppers.length - 1];
                steppers.pop();
            } else {
                i++;
            }
        }

        let j = 0;
        while (j < active.length) {
            if (active[j].next(dt).done) {
                active[j] = active[active.length - 1];
                active.pop();
            } else {
                j++;
            }
        }
    }
}
