import type { EaseParams } from "@/tween/ease/constants";

/**
 * The scene document: what a scene **is**, as data.
 *
 * A scene used to be a generator function, so the only way to know what frame N
 * looked like was to run frames 0..N-1. That made a whole class of host
 * impossible — a document cannot be stored, diffed, synced or evaluated out of
 * order when its meaning is "whatever running this code does". These types are
 * the replacement: a scene is rows, and a frame is a pure function of them.
 *
 * The split between what is data and what is code is deliberate and total:
 *
 * - **Nodes are code.** A node type is a class registered under a string key
 *   (see `document/registry.ts`). That is the extension point — a custom node
 *   with its own `@property` declarations, its own `renderSelf`, its own
 *   `@command` methods — and it is where anything a JSON value cannot express
 *   (a computed lookup table, a generated point cloud) belongs.
 * - **Scenes are data.** Which nodes exist, what props they carry, and what
 *   happens to them over time are plain JSON.
 *
 * Everything here is JSON-serializable by construction: no functions, no class
 * instances. A document round-trips through a file or a database column without
 * a mapping layer.
 */

/**
 * One node, as a row.
 *
 * Flat rather than nested, for two reasons that both bite immediately
 * otherwise: a command addresses its target by `id`, and a nested tree makes
 * "move this node under that one" a structural rewrite rather than a
 * single-field edit. It is also the shape a relational store already wants —
 * `parent` is a self-referencing foreign key.
 */
export interface NodeSpec {
    /** Stable identity. Command targets resolve to it; it survives reordering. */
    id: string;
    /**
     * Registry key of the node's class — `"rect"`, `"text"`, `"canvas3d"`, or
     * whatever a custom node registered itself as. An unknown key is a
     * validation error rather than a silently-skipped node: a document that
     * half-renders is worse than one that refuses to.
     */
    type: string;
    /**
     * An identifier, not a label. It is what a host's references resolve
     * against, so renaming one is a real edit — distinct from a display name,
     * which the host owns.
     */
    name?: string;
    /** Parent node id, or `null` for a direct child of the scene root. */
    parent: string | null;
    /**
     * Position among siblings. Load-bearing rather than cosmetic: a `row`/
     * `column` parent lays its children out in exactly this order.
     */
    order: number;
    /**
     * Authored props, **sparse** — only what differs from the type's declared
     * defaults. A freshly created node is `{}`, which is what keeps a document
     * diff small and lets a change to a default actually reach existing
     * documents.
     */
    props: Record<string, unknown>;
}

/**
 * How a command eases, as data.
 *
 * Mirrors the `linear`/`easeIn`/`easeOut`/`easeInOut` families in
 * `tween/ease/constants.ts` — `kind` picks the direction, `params` picks the
 * family and its knobs. Resolved to an `EasingFunction` once, at compile time.
 */
export interface EaseSpec {
    kind: "linear" | "in" | "out" | "inOut";
    /** Family and its parameters (`"quad"`, or `{ type: "back", overshoot: 2 }`). */
    params?: EaseParams;
}

/**
 * One command, **placed on the timeline**.
 *
 * The placement is the whole idea. A generator expressed sequencing by
 * suspending — `yield* a; yield* b` — which is why order of evaluation was
 * order of execution, and why seeking backwards meant starting over. A command
 * carries its own `at`, so:
 *
 * - **sequence** is `b.at === a.at + a.duration`,
 * - **parallel** is two commands sharing an `at`,
 * - **wait** is a gap between them.
 *
 * There are no `sequence`/`parallel`/`wait` primitives any more because there
 * is nothing left for them to do. And because every command's span is declared
 * rather than discovered, the scene's duration, its asset windows and each
 * node's lifespan are all readable straight off the document — see
 * `runtime/analysis.ts`.
 */
export interface CommandSpec {
    /** Stable identity, so a host can address and reorder one command. */
    id: string;
    /**
     * Registry key of the command — `"add"`, `"remove"`, `"to"`, or any
     * `@command()` method a node class exposes (`"moveTo"`, `"fillTo"`,
     * `"countTo"`, …). See `document/registry.ts`.
     */
    type: string;
    /**
     * The node this command acts on, or `null` for the scene root — the
     * `Canvas2D` that is simultaneously the scene's layout frame, its
     * background paint and its camera.
     */
    target: string | null;
    /**
     * Seconds from the scene's start at which the command begins.
     *
     * Seconds rather than a frame index because a document has to survive an
     * fps change: the same scene rendered at 30 and at 60 must be the same
     * animation, not the same integers. Frames are derived (`at * fps`).
     */
    at: number;
    /** Seconds the command runs for. Absent or `0` is a stamp — it applies at once. */
    duration?: number;
    /** How it eases. Absent means the command's own default. */
    easing?: EaseSpec;
    /**
     * The command's arguments. Shape is per command type: `"add"` carries
     * `{ node }`, `"to"` carries `{ props }`, a named command carries its
     * leading arguments by parameter name.
     */
    params: Record<string, unknown>;
}

/**
 * A **still**: a node tree and nothing else.
 *
 * One frame, no timeline, no commands. It is its own document type rather than
 * "an animation nobody ran" because the two are edited by different tools and
 * validated by different rules — a still carrying a duration, or a half-applied
 * tween, is a document that should never have been representable.
 */
export interface StillDocument {
    kind: "still";
    /** Every node in the scene. Order here is irrelevant — `parent`/`order` carry the structure. */
    nodes: NodeSpec[];
    /**
     * Props for the scene root: `fill`, `overlay`, `flow`, `align`, `padding`,
     * and the camera (`zoom`, `origin`, `heading`).
     */
    root?: Record<string, unknown>;
}

/**
 * An **animation**: a list of commands, and nothing else.
 *
 * There is deliberately no node tree here. A node enters the scene because an
 * `add` command put it there at a time, which is what makes a node's lifespan a
 * fact of the document rather than something discovered by running it — and
 * what keeps "when does this appear" a single editable field instead of an
 * implicit consequence of where a `stage.add(...)` sat in a function body.
 */
export interface AnimationDocument {
    kind: "animation";
    /** Every command. Order in the array is irrelevant; `at` is the placement. */
    commands: CommandSpec[];
    /**
     * Total length in seconds. Defaults to the end of the last command
     * (`max(at + duration)`), which is what you want almost always; set it to
     * hold on the final frame, or to cut a scene short.
     */
    duration?: number;
    /** Props for the scene root at t=0. Commands targeting `null` animate them. */
    root?: Record<string, unknown>;
}

/** Either document kind. */
export type SceneDocument = StillDocument | AnimationDocument;

/** Narrows a {@link SceneDocument} to a still. */
export function isStillDocument(doc: SceneDocument): doc is StillDocument {
    return doc.kind === "still";
}

/** Narrows a {@link SceneDocument} to an animation. */
export function isAnimationDocument(doc: SceneDocument): doc is AnimationDocument {
    return doc.kind === "animation";
}
