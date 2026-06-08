import { FrameGenerator } from "@/tween/generator";

/**
 * Runs a list of animations one after another.
 *
 * Each animation must complete before the next one starts. Accepts both
 * {@link FrameGenerator} instances and any `Iterable<void>` (e.g. an
 * {@link AnimationBuilder}).
 *
 * @param animations - Animations to run in order.
 *
 * @example
 * yield* sequence(
 *   nodeA.to({ x: 100 }, 0.5),
 *   wait(0.2),
 *   nodeB.to({ opacity: 0 }, 0.3),
 * );
 */
export function* sequence(
    ...animations: (FrameGenerator | Iterable<void>)[]
): FrameGenerator {
    for (const animation of animations) {
        yield* animation as any;
    }
}

