import {
    createDrivenScene,
    type Command,
    type Node,
    type Scene,
    type Stage,
} from 'motion-script';

/**
 * The local scene builder every e2e scene is written against.
 *
 * These scenes exist to prove the **renderer** does not regress — shapes, fills,
 * strokes, effects, text, 3D — so what they need is a tree and some motion over
 * it, not a document. The document model is verified where it lives, in core's
 * own tests; here it would only bury the thing under test in rows.
 *
 * Built on `createDrivenScene`, the public seam a host with its own timeline
 * model uses, so these run through exactly the evaluation path a document does:
 * built once, compiled once, then asked for a time. There is no generator
 * anywhere below it.
 */

/**
 * One step in a chain: a command to run after the previous one finishes, a
 * number of **seconds to hold**, or an array of commands that all start together
 * and end when the longest does.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCommand = Command<any>;

export type Step =
    | (() => AnyCommand)
    | number
    | Array<() => AnyCommand>;

/** Every node in `root`'s subtree, root included. */
function walk(root: Node, out: Node[] = []): Node[] {
    out.push(root);
    for (const child of root._allChildren) walk(child, out);
    return out;
}

interface Placed {
    start: number;
    duration: number;
    command: AnyCommand;
}

/**
 * A scene: a tree, then a chain of commands over it.
 *
 * ```ts
 * const box = createRef<Rect>();
 * export default scene(
 *     (stage) => {
 *         stage.set({ fill: 'bg' });
 *         stage.add(<Rect ref={box} width={200} height={200} fill="primary" />);
 *     },
 *     [() => box().to({ x: 200 }, 1, easeInOut('quad')), holdTail(1)],
 * );
 * ```
 *
 * Each step starts where the previous one ended. Unlike the `yield*` it replaces,
 * the result is seekable: the chain is compiled once and every frame is a pure
 * evaluation of it, so a frame looks the same however the playhead reached it.
 */
export function scene(build: (stage: Stage) => void, steps: Step[] = []): Scene {
    let placed: Placed[] = [];
    let baselines: Array<{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        node: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        layer: any;
        stackDepth: number;
    }> = [];
    let structure: Array<{ node: Node; parent: Node; index: number }> = [];
    let total = 0;

    /**
     * Put the tree back to its built state — props **and** membership.
     *
     * Membership matters because a structural command (`removeChildAt`,
     * `reparent`) detaches a node when it reaches `at(1)`, and no prop snapshot
     * undoes that. Compiling runs every command to its end, so without this the
     * tree would be missing exactly those nodes on every frame *before* the
     * command that removes them.
     */
    const restore = (): void => {
        for (const b of baselines) {
            const signals = b.node.__cells?.signals;
            if (signals) {
                for (const [key, snap] of b.layer) signals.get(key)?.restoreFrom(snap);
            }
            if (b.node._stateStack.length > b.stackDepth) {
                b.node._stateStack.length = b.stackDepth;
            }
        }
        for (const entry of structure) {
            if (entry.node.parent === entry.parent) continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const parent = entry.parent as any;
            parent.addChildAt(entry.node, Math.min(entry.index, parent._allChildren.length));
        }
    };

    return createDrivenScene({
        build(stage: Stage) {
            build(stage);

            const nodes = walk(stage.canvas);
            baselines = nodes.map((node) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const host = node as any;
                const layer = new Map();
                const signals = host.__cells?.signals;
                if (signals) for (const [key, cell] of signals) layer.set(key, cell.snapshot());
                return { node: host, layer, stackDepth: host._stateStack.length };
            });
            structure = [];
            for (const node of nodes) {
                const parent = node.parent;
                if (!parent) continue;
                structure.push({ node, parent, index: parent._allChildren.indexOf(node) });
            }
        },

        // Split from `build` because a command may read post-layout state to
        // decide what it animates *from* — an animated `removeChildAt` pins the
        // departing child to its rendered width, which is zero until a layout
        // pass has run. See `SceneDriver.compile`.
        compile() {
            placed = [];
            total = 0;
            for (const step of steps) {
                if (typeof step === 'number') {
                    total += step;
                    continue;
                }
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

        /**
         * The chain's own boundaries: every step's start and end.
         *
         * A chain knows these because each step is *placed*, not advanced to, so
         * the measuring pass samples them instead of walking every frame. Read
         * off `placed`, which `compile` has already filled in.
         */
        keyTimes() {
            const times = new Set<number>([0, total]);
            for (const p of placed) {
                times.add(p.start);
                times.add(p.start + p.duration);
            }
            return [...times].filter((t) => t >= 0 && t <= total).sort((a, b) => a - b);
        },

        evaluateAt(seconds: number) {
            restore();
            for (const p of placed) {
                if (seconds < p.start) continue;
                const local = p.duration > 0 ? (seconds - p.start) / p.duration : 1;
                p.command.at(Math.max(0, Math.min(1, local)));
            }
        },

        get duration() {
            return total;
        },
    });
}
