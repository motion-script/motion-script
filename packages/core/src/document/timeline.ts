import { clamp01 } from "@/util/clamp";
import { applySnapshotLayer, captureLayer, type PropLayer, type ReactiveHost } from "@/nodes/node/node-reactive";
import type { Node } from "@/nodes/node/node";
import type { Node2D } from "@/nodes/2d/node2d";
import type { Stage } from "@/nodes/scene/stage";
import type { Command } from "@/tween/command";
import type { EasingFunction } from "@/tween/ease/type";
import { easeIn, easeInOut, easeOut, linear } from "@/tween/ease/constants";
import { instantiate, resolveCommandType } from "./registry";
import type { CommandSpec, EaseSpec, NodeSpec, SceneDocument } from "./types";
import { isStillDocument } from "./types";

/**
 * A compiled scene document: the thing that answers "what does this look like
 * at `t`" without having rendered `t - 1`.
 *
 * This is the whole reason the document model exists. A generator scene could
 * only be *advanced*, so a backward seek meant tearing the tree down and
 * replaying from frame 0, and a scene's duration was unknowable without running
 * it to the end. A timeline is built once and evaluated in any order, at any
 * time, as many times as you like — which is what makes scrubbing cheap, export
 * parallelizable, and a frame reproducible.
 *
 * ### The two phases, and why `from` needs both
 *
 * **Build** instantiates every node the document mentions and parents it.
 *
 * **Compile** then walks the commands in `at` order and asks each one's factory
 * for a {@link Command}. That order is load-bearing: a command's *start* value
 * is read from the node at the moment it is constructed (`node.to({x: 100})`
 * snapshots whatever `x` is now), so each command has to be built with the node
 * in the state its predecessors left. Compile therefore runs every command to
 * `at(1)` before building the next — see {@link compile}. Once built, a
 * `Command.at(t)` is pure, and the mutations compile caused are undone by
 * restoring the baseline.
 *
 * Building is O(commands) and happens once. Evaluating is what happens per
 * frame, and is O(commands) with no allocation.
 */

/** A command with its place on the timeline, ready to evaluate. */
interface PlacedCommand {
    spec: CommandSpec;
    /** Seconds from scene start. */
    start: number;
    /** Seconds. Zero is a stamp — it applies in full from `start` onward. */
    duration: number;
    command: Command<Record<string, unknown>>;
    /** The node it writes to, so evaluation knows whose baseline to restore. */
    target: Node;
}

/** When a node is in the tree. `end` is `Infinity` unless something removes it. */
interface PresenceSpan {
    start: number;
    end: number;
}

/** What `build` records about one node so evaluation can find and reset it. */
interface LiveNode {
    spec: NodeSpec;
    node: Node;
    /** Snapshot of every reactive cell at t=0, before any command touched it. */
    baseline: PropLayer;
    /** Depth of the node's save stack at t=0 — see {@link SceneTimeline.restoreBaselines}. */
    baseStackDepth: number;
}

/** Resolve an {@link EaseSpec} to the function the tween actually calls. */
function resolveEase(ease: EaseSpec | undefined): EasingFunction | undefined {
    if (!ease) return undefined;
    switch (ease.kind) {
        case "linear": return linear();
        case "in": return easeIn(ease.params);
        case "out": return easeOut(ease.params);
        case "inOut": return easeInOut(ease.params);
    }
}

/**
 * Order commands for compilation and evaluation.
 *
 * By `at`, then by the order they appear in the document. The tiebreak matters:
 * two commands sharing an `at` is how the model spells "in parallel", and when
 * both write the same prop the later one in the array wins — the same
 * last-writer rule `commandParallel` already uses, so the two compose
 * predictably.
 */
function inTimelineOrder(commands: readonly CommandSpec[]): CommandSpec[] {
    return commands
        .map((spec, index) => ({ spec, index }))
        .sort((a, b) => (a.spec.at - b.spec.at) || (a.index - b.index))
        .map((e) => e.spec);
}

/** Every node the document brings into being, still or animation. */
function nodeSpecsOf(doc: SceneDocument): NodeSpec[] {
    if (isStillDocument(doc)) return doc.nodes;
    const out: NodeSpec[] = [];
    for (const command of doc.commands) {
        if (command.type !== "add") continue;
        const spec = (command.params as { node?: NodeSpec }).node;
        if (spec) out.push(spec);
    }
    return out;
}

/**
 * When each node is in the tree.
 *
 * Read off the document rather than accumulated during playback: an `add` at
 * 2s and a `remove` at 5s say the node is present on `[2, 5)` at every seek,
 * whether the playhead arrived from 1s or from 9s. A presence that was
 * *accumulated* would depend on the route taken, which is exactly the class of
 * bug this model exists to remove.
 */
function presenceOf(doc: SceneDocument): Map<string, PresenceSpan> {
    const spans = new Map<string, PresenceSpan>();
    if (isStillDocument(doc)) {
        for (const node of doc.nodes) spans.set(node.id, { start: 0, end: Infinity });
        return spans;
    }
    for (const command of doc.commands) {
        if (command.type === "add") {
            const spec = (command.params as { node?: NodeSpec }).node;
            if (spec) spans.set(spec.id, { start: command.at, end: Infinity });
        }
    }
    for (const command of doc.commands) {
        if (command.type !== "remove" || command.target === null) continue;
        const span = spans.get(command.target);
        if (span) span.end = Math.min(span.end, command.at);
    }
    return spans;
}

/**
 * The scene document, compiled and evaluable.
 *
 * Implements `SceneDriver` (`nodes/scene/scene-node.ts`), so the whole existing
 * runtime below it — layout, render, assets, signals, the clock — is unchanged.
 * Only *how a prop gets its value for a frame* is different.
 */
export class SceneTimeline {
    private readonly doc: SceneDocument;
    private readonly specs: NodeSpec[];
    private readonly presence: Map<string, PresenceSpan>;

    /** Live nodes by id, valid between {@link build} and the next rebuild. */
    private live = new Map<string, LiveNode>();
    private placed: PlacedCommand[] = [];
    /** The scene root (`target: null`), plus its baseline. */
    private root: LiveNode | null = null;
    /**
     * Only the nodes some command writes to. Everything else keeps its authored
     * props for the life of the scene, so restoring it every frame would be pure
     * waste — and on a large static scene that waste is most of the frame.
     */
    private animated: LiveNode[] = [];

    /** Children each parent built for itself, which the document must not disturb. */
    private baseChildCount = new Map<string, number>();
    /** Node ids currently in the tree, so presence only churns when it changes. */
    private present = new Set<string>();

    private _duration = 0;

    constructor(doc: SceneDocument) {
        this.doc = doc;
        this.specs = nodeSpecsOf(doc);
        this.presence = presenceOf(doc);
    }

    /** How long the scene runs. Read by the runtime after {@link build}. */
    get duration(): number {
        return this._duration;
    }

    /**
     * Instantiate the tree and compile the timeline.
     *
     * Runs on every build pass and must build fresh nodes each time —
     * `Scene.reset()` disposes and clears the canvas's children between passes,
     * so anything captured outside this call is torn down before its second use.
     */
    build(stage: Stage): void {
        this.live = new Map();
        this.placed = [];
        this.animated = [];
        this.present = new Set();
        this.baseChildCount = new Map();

        if (this.doc.root) stage.set(this.doc.root);

        for (const spec of this.specs) {
            this.live.set(spec.id, { spec, node: instantiate(spec), baseline: new Map(), baseStackDepth: 0 });
        }

        // Record what each parent built for itself *before* any document child
        // lands, so a composite node's own children keep their indices. A
        // document child is always placed after them.
        this.baseChildCount.set("", stage.canvas._allChildren.length);
        for (const [id, entry] of this.live) {
            this.baseChildCount.set(id, entry.node._allChildren.length);
        }

        this.syncPresence(stage, 0);

        // Baselines are captured with every node mounted, because an unmounted
        // node's commands are inert and its cells would snapshot pre-attach
        // values. The root's is captured too: `target: null` commands animate the
        // camera and the scene fill, and those need resetting like anything else.
        this.root = { spec: rootSpec(), node: stage.canvas, baseline: new Map(), baseStackDepth: 0 };
        this.captureBaselines(stage);

        this.compile();
        this.restoreBaselines();

        this._duration = this.computeDuration();
    }

    /** Snapshot every reactive cell of every node, at its authored state. */
    private captureBaselines(stage: Stage): void {
        for (const entry of this.live.values()) {
            const host = entry.node as unknown as ReactiveHost;
            entry.baseline = captureLayer(host);
            entry.baseStackDepth = host._stateStack.length;
        }
        if (this.root) {
            const host = stage.canvas as unknown as ReactiveHost;
            this.root.baseline = captureLayer(host);
            this.root.baseStackDepth = host._stateStack.length;
        }
    }

    /**
     * Put every animated node back to its authored state.
     *
     * The save stack is truncated alongside the props, and that is not
     * housekeeping. `save`/`restore` are commands, so a `save` re-runs on every
     * evaluation of a frame after it — without the truncation the stack would
     * grow by one layer per frame forever, and a later `restore` would pop a
     * layer pushed by some *other* seek instead of the one its own `save` made.
     * Truncating is what keeps the pair a function of the chain rather than of
     * how the playhead got here.
     */
    private restoreBaselines(): void {
        for (const entry of this.animated) {
            const host = entry.node as unknown as ReactiveHost;
            applySnapshotLayer(host, entry.baseline);
            if (host._stateStack.length > entry.baseStackDepth) {
                host._stateStack.length = entry.baseStackDepth;
            }
        }
    }

    /**
     * Build every command, in timeline order, against a node already holding
     * what its predecessors left.
     *
     * The running-to-`at(1)` in the middle of this loop is not an optimization
     * and cannot be skipped: `node.to({ x: 100 })` reads `x` when the command is
     * *constructed*, so a chain built against the untouched tree would give every
     * step the same `from` and each would jump back to the start.
     */
    private compile(): void {
        if (isStillDocument(this.doc)) return;

        const touched = new Set<string>();
        for (const spec of inTimelineOrder(this.doc.commands)) {
            const entry = resolveCommandType(spec.type);
            if (!entry) {
                throw new Error(
                    `Unknown command type "${spec.type}" (command ${spec.id}). ` +
                    `Register it with registerCommandType before building.`,
                );
            }
            // `add`/`remove` change which nodes exist, not what their props are;
            // presence already covers them (see `presenceOf`).
            if (entry.structural) continue;

            const target = this.targetOf(spec);
            if (!target) continue;

            const duration = spec.duration ?? 0;
            const command = entry.factory(
                target.node,
                spec.params,
                duration,
                resolveEase(spec.easing),
            );

            this.placed.push({ spec, start: spec.at, duration, command, target: target.node });

            if (!touched.has(target.id)) {
                touched.add(target.id);
                this.animated.push(target.entry);
            }

            // Leave the node where this command ends, so the next one's `from`
            // is right. Undone wholesale by `restoreBaselines`.
            command.at(1);
        }
    }

    /** Resolve a command's `target` to a live node, or `null` if it names nothing. */
    private targetOf(spec: CommandSpec): { id: string; node: Node; entry: LiveNode } | null {
        if (spec.target === null) {
            return this.root ? { id: "", node: this.root.node, entry: this.root } : null;
        }
        const entry = this.live.get(spec.target);
        return entry ? { id: spec.target, node: entry.node, entry } : null;
    }

    /** End of the last command, unless the document says otherwise. */
    private computeDuration(): number {
        if (isStillDocument(this.doc)) return 0;
        if (this.doc.duration !== undefined) return this.doc.duration;
        let end = 0;
        for (const command of this.doc.commands) {
            end = Math.max(end, command.at + (command.duration ?? 0));
        }
        return end;
    }

    /**
     * Put every node into the state it holds at `seconds`.
     *
     * A pure function of `seconds`: called in any order, repeatedly, and with
     * time going backwards. Restoring the baseline first is what makes it so —
     * without it a prop written by a command that has *not started yet* would
     * keep whatever the last evaluation left, and the same frame would look
     * different depending on how the playhead reached it.
     */
    evaluateAt(seconds: number): void {
        this.restoreBaselines();

        for (const placed of this.placed) {
            if (seconds < placed.start) continue;
            const local = placed.duration > 0
                ? (seconds - placed.start) / placed.duration
                : 1;
            // A finished command is held at `at(1)` rather than dropped, so a prop
            // written early and never touched again keeps its value — the same
            // rule `commandSequence` uses.
            placed.command.at(clamp01(local));
        }
    }

    /**
     * Add and remove document nodes so the tree matches `seconds`.
     *
     * Separate from {@link evaluateAt} because it is structural: it changes what
     * layout walks, not what a prop holds. Called by the driver ahead of the
     * evaluation for the same time.
     */
    syncPresence(stage: Stage, seconds: number): void {
        const wanted = new Set<string>();
        for (const [id, span] of this.presence) {
            if (seconds >= span.start && seconds < span.end) wanted.add(id);
        }
        // Nothing to do on the overwhelming majority of frames.
        if (sameSet(wanted, this.present)) return;

        // Detach first: `remove` unmounts the whole subtree, so a node moving
        // parents is never briefly in two places.
        for (const id of this.present) {
            if (wanted.has(id)) continue;
            const entry = this.live.get(id);
            if (!entry) continue;
            const parent = this.parentNodeOf(entry.spec, stage);
            parent?.remove(entry.node);
        }

        // Insert in document order, after whatever the parent built for itself,
        // so `order` really is sibling order and a composite's own children keep
        // their indices.
        const byParent = new Map<string, NodeSpec[]>();
        for (const spec of this.specs) {
            if (!wanted.has(spec.id)) continue;
            const key = spec.parent ?? "";
            const list = byParent.get(key) ?? [];
            list.push(spec);
            byParent.set(key, list);
        }

        for (const [parentId, specs] of byParent) {
            specs.sort((a, b) => a.order - b.order);
            const parent = parentId === "" ? stage.canvas : this.live.get(parentId)?.node;
            if (!parent) continue;
            const base = this.baseChildCount.get(parentId) ?? 0;
            specs.forEach((spec, i) => {
                if (this.present.has(spec.id) && wanted.has(spec.id)) return;
                const child = this.live.get(spec.id);
                if (!child) return;
                (parent as Node2D).addChildAt(child.node, base + i);
            });
        }

        this.present = wanted;
    }

    /** The live node a spec's `parent` names, or the scene root. */
    private parentNodeOf(spec: NodeSpec, stage: Stage): Node | undefined {
        if (spec.parent === null) return stage.canvas;
        return this.live.get(spec.parent)?.node;
    }
}

/** The scene root's stand-in spec. It has no row of its own — `target: null` names it. */
function rootSpec(): NodeSpec {
    return { id: "", type: "canvas2d", parent: null, order: 0, props: {} };
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
}
