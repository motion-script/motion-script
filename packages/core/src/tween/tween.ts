import { FrameGenerator } from "@/tween/generator";

/**
 * Core animation primitive. Runs `callback` every frame for `duration` seconds,
 * passing a normalized progress value `t` in [0, 1].
 *
 * The callback receives a pre-eased `t` — apply your easing before calling
 * (typically done by {@link AnimationBuilder} / node helpers). The generator
 * guarantees a final call with `t = 1` so the end state is always applied
 * cleanly, even if the last frame overshoots.
 *
 * @param duration - Length of the animation in seconds.
 * @param callback - Called each frame with the current normalized progress.
 *
 * @example
 * yield* tween(0.5, t => { node.opacity = t; });
 */
export function* tween(
    duration: number,
    callback: (t: number) => void
): FrameGenerator {
    let elapsed = 0;
    while (elapsed < duration) {
        const t = elapsed / duration;

        callback(t);
        const dt = yield;
        elapsed += dt;
    }

    // Ensure the tween ends exactly at 1
    callback(1);

    return;
}
