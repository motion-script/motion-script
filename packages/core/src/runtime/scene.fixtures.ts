import { applySnapshotLayer, captureLayer, type PropLayer, type ReactiveHost } from "@/nodes/node/node-reactive";
import type { Node } from "@/nodes/node/node";
import { createDrivenScene, type Scene } from "@/nodes/scene/scene-node";
import type { Stage } from "@/nodes/scene/stage";
import type { Command } from "@/tween/command";
import { clamp01 } from "@/util/clamp";

/**
 * Test-only scene builders, for exercising the runtime without hand-writing a
 * document.
 *
 * A real scene is data: `createStillScene` / `createAnimationScene` compile a
 * document into a timeline. Most runtime tests are not *about* the document —
 * they are about layout, context inheritance, asset declaration or seeking — and
 * spelling out node rows and command rows for each would bury the thing under
 * test. These take the tree as code and the animation as a chain of
 * {@link Command}s, and compile them exactly the way `SceneTimeline` compiles a
 * document, so what they exercise is the same evaluation path.
 *
 * Not exported from the package barrel: a scene in real use comes from a
 * document.
 */

/**
 * A step in a {@link chainScene}.
 *
 * One of three things:
 *
 * - a command to run after the previous step finishes;
 * - a **number of seconds to hold** — the replacement for
 *   `for (let i = 0; i < n; i++) yield;`, which was how a generator body waited;
 * - an **array of commands that all start together**, ending when the longest
 *   does. The replacement for `yield* parallel(...)`, and the same thing two
 *   document commands sharing an `at` express.
 */
export type ChainStep = (() => Command<never>) | number | Array<() => Command<never>>;

/** Every node in `root`'s subtree, root included. */
function walk(root: Node, out: Node[] = []): Node[] {
    out.push(root);
    for (const child of root._allChildren) walk(child, out);
    return out;
}

/**
 * A scene whose animation is a **sequence** of commands on live nodes.
 *
 * The direct replacement for the generator-era test shape:
 *
 * ```ts
 * // was: createScene(function* (stage) { stage.add(…); yield* ref().to({ x: 100 }, 1); })
 * chainScene(
 *     (stage) => stage.add(new Rect({ ref, width: 10, height: 10 })),
 *     [() => ref().to({ x: 100 }, 1)],
 * );
 * ```
 *
 * Each step starts where the previous one ended, which is what `yield*` meant.
 * Unlike `yield*`, the result is seekable: the chain is compiled once and every
 * frame is a pure evaluation of it.
 */
export function chainScene(build: (stage: Stage) => void, steps: ChainStep[] = []): Scene {
    interface Placed {
        start: number;
        duration: number;
        command: Command<never>;
    }

    let placed: Placed[] = [];
    let baselines: Array<{ host: ReactiveHost; layer: PropLayer; stackDepth: number }> = [];
    let total = 0;

    const restore = (): void => {
        for (const b of baselines) {
            applySnapshotLayer(b.host, b.layer);
            if (b.host._stateStack.length > b.stackDepth) {
                b.host._stateStack.length = b.stackDepth;
            }
        }
    };

    return createDrivenScene({
        build(stage: Stage) {
            build(stage);
            placed = [];
            total = 0;

            // Baselines are captured with the tree mounted, before any command
            // has written to it — the state every evaluation resets to.
            baselines = walk(stage.canvas).map((node) => {
                const host = node as unknown as ReactiveHost;
                return { host, layer: captureLayer(host), stackDepth: host._stateStack.length };
            });

            // Compile in order, leaving each node where its command ends, so the
            // next command's `from` is what a sequential run would have given it.
            for (const step of steps) {
                if (typeof step === "number") {
                    total += step;
                    continue;
                }
                // A group starts every command at the group's own start and ends
                // when the longest does — each is compiled against the tree as the
                // *previous group* left it, which is what makes siblings that
                // animate the same prop independent of each other.
                const group = Array.isArray(step) ? step : [step];
                let longest = 0;
                for (const make of group) {
                    const command = make();
                    placed.push({ start: total, duration: command.duration, command });
                    longest = Math.max(longest, command.duration);
                    command.at(1);
                }
                total += longest;
            }
            restore();
        },

        evaluateAt(seconds: number) {
            restore();
            for (const p of placed) {
                if (seconds < p.start) continue;
                p.command.at(clamp01(p.duration > 0 ? (seconds - p.start) / p.duration : 1));
            }
        },

        get duration() {
            return total;
        },
    });
}

/**
 * A scene that is just a tree — one frame, nothing animated.
 *
 * The test-side twin of `createStillScene`.
 */
export function stillScene(build: (stage: Stage) => void): Scene {
    return chainScene(build, []);
}
