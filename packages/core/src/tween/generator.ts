/**
 * A generator that drives a single animation forward frame by frame.
 *
 * - **yield** suspends the animation and receives the elapsed delta time (`dt`,
 *   in seconds) for that frame when execution resumes.
 * - **return** (or falling off the end) signals completion.
 *
 * Compose frame generators with {@link sequence} and {@link parallel}, or
 * drive them manually by calling `.next(dt)` until `.done` is `true`.
 *
 * @example
 * function* fadeIn(node: MyNode): FrameGenerator {
 *   let elapsed = 0;
 *   while (elapsed < 1) {
 *     node.opacity = elapsed;
 *     elapsed += yield;
 *   }
 *   node.opacity = 1;
 * }
 */
export type FrameGenerator = Generator<void, void, number>;