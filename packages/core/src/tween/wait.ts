import { FrameGenerator } from "@/tween/generator";

/**
 * Pauses the animation timeline for a fixed number of seconds.
 *
 * Yields control back to the runtime each frame until the elapsed time reaches
 * `seconds`, then returns. Use inside {@link sequence} to add gaps between
 * animations, or inside {@link parallel} to delay a branch.
 *
 * @param seconds - How long to wait, in seconds.
 *
 * @example
 * yield* sequence(
 *   node.to({ opacity: 1 }, 0.3),
 *   wait(0.5),
 *   node.to({ opacity: 0 }, 0.3),
 * );
 */
export function* wait(
    seconds: number
): FrameGenerator {
    let elapsed = 0;
    while (elapsed < seconds) {
        const dt = yield;
        elapsed += dt;
    }

    return;
}

