import { createDrivenScene, type Scene, type SceneDriver } from "@/nodes/scene/scene-node";
import type { Stage } from "@/nodes/scene/stage";
import { SceneTimeline } from "./timeline";
import type { AnimationDocument, SceneDocument, StillDocument } from "./types";
import { assertValidDocument } from "./validate";

/**
 * Turn a scene document into a `Scene` the runtime can render.
 *
 * This is the only bridge between the document model and everything below it.
 * What comes out is an ordinary `Scene` — the same `Canvas2D`, layout pass,
 * render pass, asset declarations, signals and clock a scene has always had.
 * The single difference is where a prop's value for a frame comes from: a
 * compiled timeline that can be *asked*, rather than a generator that had to be
 * *run*.
 */

/** Options shared by both builders. */
export interface SceneDocumentOptions {
    /** Name shown on the timeline and in errors. */
    name?: string;
    /**
     * Skip validation. Only for a caller that has already validated the
     * document — an editor that validates on every edit, say. Off by default,
     * because the failure a bad document produces downstream (an undefined
     * padding deep inside the layout engine) names nothing useful.
     */
    trusted?: boolean;
}

/**
 * Build a `Scene` from a document.
 *
 * Presence and props are applied together on every evaluation: `syncPresence`
 * first, because it decides *which* nodes exist, then the timeline writes what
 * their props hold. Both are pure functions of the time, which is what makes a
 * frame identical however the playhead reached it.
 */
function sceneFrom(doc: SceneDocument, options?: SceneDocumentOptions): Scene {
    if (!options?.trusted) assertValidDocument(doc);

    const timeline = new SceneTimeline(doc);
    let stage: Stage | null = null;

    const driver: SceneDriver = {
        build(s: Stage) {
            stage = s;
            timeline.build(s);
        },
        evaluateAt(seconds: number) {
            if (stage) timeline.syncPresence(stage, seconds);
            timeline.evaluateAt(seconds);
        },
        get duration() {
            return timeline.duration;
        },
    };

    const scene = createDrivenScene(driver);
    if (options?.name) scene.name = options.name;
    return scene;
}

/**
 * Build a **still** — one frame, from a node tree.
 *
 * ```ts
 * const poster = createStillScene({
 *     kind: "still",
 *     root: { fill: "bg" },
 *     nodes: [
 *         { id: "card", type: "rect", parent: null, order: 0,
 *           props: { width: 400, height: 240, cornerRadius: 24, fill: "card" } },
 *         { id: "title", type: "text", parent: "card", order: 0,
 *           props: { text: "Motion Script", fontSize: 48 } },
 *     ],
 * });
 * ```
 *
 * Nothing about rendering it differs from an animation's frame 0 — it is the
 * same build → layout → render pass.
 */
export function createStillScene(doc: StillDocument, options?: SceneDocumentOptions): Scene {
    return sceneFrom(doc, options);
}

/**
 * Build an **animation** — a list of commands.
 *
 * ```ts
 * const intro = createAnimationScene({
 *     kind: "animation",
 *     commands: [
 *         { id: "c0", type: "add", target: null, at: 0, params: {
 *             node: { id: "card", type: "rect", parent: null, order: 0,
 *                     props: { width: 400, height: 240, opacity: 0 } } } },
 *         { id: "c1", type: "to", target: "card", at: 0, duration: 0.6,
 *           easing: { kind: "out", params: "quad" }, params: { props: { opacity: 1 } } },
 *         { id: "c2", type: "moveTo", target: "card", at: 0.6, duration: 0.8,
 *           params: { x: 200, y: 0 } },
 *     ],
 * });
 * ```
 *
 * There is no node tree of its own: `add` brings a node into being at a time,
 * which is what makes "when does this appear" a field you can edit rather than
 * a consequence of where a call sat in a function body.
 */
export function createAnimationScene(doc: AnimationDocument, options?: SceneDocumentOptions): Scene {
    return sceneFrom(doc, options);
}

/** Build whichever kind the document declares. */
export function createSceneFromDocument(doc: SceneDocument, options?: SceneDocumentOptions): Scene {
    return sceneFrom(doc, options);
}
