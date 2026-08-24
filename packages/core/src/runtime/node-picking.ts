import { Node } from "@/nodes/node/node";
import { Node2D } from "@/nodes/2d/node2d";
import { Canvas3D } from "@/nodes/three/canvas3d-node";
import { Vector2 } from "@/attributes/layout/vector2";
import { Matrix2D, identity, multiply, invert, applyToPoint, cameraMatrix, translation } from "@/attributes/layout/matrix2d";
import { worldAnchors } from "@/nodes/2d/node-transform";
import { nodePath } from "@/project/tree";
import { collectBoxes3D, pickNode3D, type Canvas3DFrame } from "./node-picking3d";

/**
 * Pure geometry for editor-style direct manipulation: where a node's pixels
 * landed, and which node is under a point. No controller state, so it can be
 * exercised against hand-built node trees.
 *
 * **Space.** Everything here is in *viewport space*: origin at the viewport
 * centre, y-up, units = the viewport pixels the player was given. That is the
 * same space `Node2D.global` reports, plus the camera — see {@link renderMatrix}.
 */

/**
 * A node's on-screen box at the current frame, in viewport space (origin at the
 * viewport centre, y-up).
 *
 * Unlike {@link Node2D.global} this folds in any active camera scope, so it
 * describes where the node's pixels actually landed — which is what an editor
 * overlay needs in order to draw a selection box over them.
 */
export interface NodeBox {
    /** Per-instance id — changes on every rebuild. Use {@link path} to key across rebuilds. */
    id: string;
    /** Structural path from the scene root (`""` is the root); stable across rebuilds. */
    path: string;
    /** Node2D class name, e.g. `Rect`, `Text`. */
    type: string;
    /** Corners in draw order, viewport space. Rotated/scaled — not axis-aligned. */
    topLeft: Vector2;
    topRight: Vector2;
    bottomRight: Vector2;
    bottomLeft: Vector2;
    center: Vector2;
    /**
     * Size of the box before rotation/scale, in scene units — the node's layout
     * size for everything whose drawing fills its cell, and the ink's own extent
     * where the two differ (see {@link Node2D._localBounds}; a `Line` reports the
     * span of its `points`, not its layout rect).
     */
    width: number;
    height: number;
    /** Folded rotation (degrees clockwise) and uniform scale, camera included. */
    rotation: number;
    scale: number;
    /** Effective alpha; `0` means the node is present but invisible. */
    opacity: number;
}

/**
 * The renderer's CTM at `node` — every ancestor's local matrix from the scene
 * root down, with a camera scope inserted wherever an ancestor pushes one
 * ({@link Node2D._cameraScope}; `Canvas2D`/`Camera` call `beginCamera` between
 * their own transform and their children's).
 *
 * Mirrors the render walk exactly, including the camera's `translate(rect.x,
 * -rect.y)` — if a box ever disagrees with the pixels, the divergence is here.
 *
 * `@internal`, and shared with `text-geometry.ts`: a caret drawn over a node has
 * to land in the same space as the box drawn around it, so both must come from
 * this one walk rather than two that agree by inspection.
 */
/** @internal */
export function renderMatrix(node: Node2D): Matrix2D {
    const chain: Node2D[] = [];
    for (let n: Node2D | null = node; n; n = n.parent) chain.push(n);
    chain.reverse();

    let m = identity();
    for (let i = 0; i < chain.length; i++) {
        const n = chain[i];
        m = multiply(m, n._localMatrix());
        // A camera applies to the node's *children*, so it is skipped on the leaf.
        if (i < chain.length - 1) {
            const cam = n._cameraScope();
            if (cam) {
                const r = n.layoutBounds;
                m = multiply(m, cameraMatrix(r.x, -r.y, cam.lookAt, cam.zoom, cam.heading));
            }
        }
    }
    return m;
}

/**
 * Folded rotation / scale / opacity from the scene root down to `node`, matching
 * the renderer's nested transforms and its pass-through alpha fold. The same
 * accumulation {@link Node2D.global} does, extended with the camera scopes: a
 * camera multiplies the scale by its `zoom` and adds `-heading` to the rotation
 * (the renderer applies `rotate(-heading)`).
 */
function foldedTransform(node: Node2D): { rotation: number; scale: number; opacity: number } {
    let rotation = 0;
    let scale = 1;
    let opacity = 1;
    for (let n: Node2D | null = node; n; n = n.parent) {
        rotation += n.rotation;
        scale *= n.scale;
        opacity *= n.opacity;
        // Skip the node's own camera: it scopes its children, not itself.
        const cam = n !== node ? n._cameraScope() : null;
        if (cam) {
            rotation -= cam.heading;
            scale *= cam.zoom;
        }
    }
    return { rotation, scale, opacity };
}

/** Build the viewport-space box for `node` at the current frame. */
export function nodeBox(node: Node2D, path: string): NodeBox {
    const b = node._localBounds();
    // `worldAnchors` maps offsets centred on the matrix's origin, so shift the
    // matrix onto the bounds' own centre first — that is what lets a node whose
    // ink is off-centre (a Line) report a box that actually sits on the ink.
    // The matrix is canvas y-down; the bounds are y-up, hence the sign on y.
    const m = b.x === 0 && b.y === 0
        ? renderMatrix(node)
        : multiply(renderMatrix(node), translation(b.x, -b.y));
    const anchors = worldAnchors(m, b.width / 2, b.height / 2);
    const folded = foldedTransform(node);
    return {
        id: node.id,
        path,
        type: node.name,
        topLeft: anchors.topLeft,
        topRight: anchors.topRight,
        bottomRight: anchors.bottomRight,
        bottomLeft: anchors.bottomLeft,
        center: anchors.center,
        width: b.width,
        height: b.height,
        rotation: folded.rotation,
        scale: folded.scale,
        opacity: folded.opacity,
    };
}

/**
 * The box at a structural path, in either dimension, or `null` when the path
 * doesn't resolve.
 *
 * The one entry point that answers for a 3D node as well as a 2D one, which a
 * bare {@link nodeBox} cannot: a mesh is not a `Node2D` and has no box of its
 * own — what it has is a projection into the viewport that holds it, and finding
 * that viewport is part of resolving the path (see `node-picking3d.ts`).
 *
 * Walks {@link Node._allChildren}, so the paths it accepts are the ones every
 * other structural walk in the engine produces.
 */
export function nodeBoxAt(root: Node2D, path: string): NodeBox | null {
    if (path === "") return nodeBox(root, path);

    let node: Node = root;
    let canvas: { node: Canvas3D; path: string } | null = null;
    const segments = path.split(".");
    for (let i = 0; i < segments.length; i++) {
        if (node instanceof Canvas3D) canvas = { node, path: prefixPath(segments, i) };
        const next = node._allChildren[Number(segments[i])];
        if (!next) return null;
        node = next;
    }

    if (node instanceof Node2D) return nodeBox(node, path);
    // A 3D node: ask the viewport that holds it. There is always one — a `Node3D`
    // cannot be parented anywhere else (motion-script throws rather than allowing
    // it) — so a `null` here is a malformed tree rather than a missing case.
    if (!canvas) return null;
    const frame = canvas3DFrame(canvas.node, canvas.path);
    return collectBoxes3D(canvas.node, frame, canvas.path).find((box) => box.path === path) ?? null;
}

/** The first `count` segments of a split path, rejoined. */
function prefixPath(segments: readonly string[], count: number): string {
    return segments.slice(0, count).join(".");
}

/**
 * The topmost node whose hit region contains `point` (viewport space, y-up,
 * origin at the viewport centre), or `null`. Children paint over their parent and
 * later siblings over earlier ones, so the walk tests children last-to-first
 * before falling back to the node itself.
 *
 * Skips fully transparent nodes — a scene built with spawn delays keeps
 * not-yet-visible nodes in the tree at `opacity: 0`, and those must not be
 * selectable. A node that clips (or pushes a camera, which clips to its viewport)
 * confines its subtree: a point outside its box cannot hit anything inside it.
 * The scene root is never returned; it is the stage, not a selectable node.
 *
 * The hit region is {@link Node2D.hitTestSelf} — the rotated layout box by default,
 * narrowed to the declared outline for shapes. A click in the corner of a rect's
 * box selects it; a click in the empty notch of a star's box does not.
 *
 * `tolerance` is grab-slop in scene units, applied outward from the ink. A host
 * passes its zoom-corrected pixel slop so the grab area stays constant on screen.
 * It is what makes thin shapes reachable.
 *
 * Cost: {@link renderMatrix} walks to the root per node, making a pick O(depth²).
 * Scene trees here are shallow (tens of nodes, depth < 10), so this is fine at
 * pointer rate. If it ever matters, thread the parent's accumulated matrix down
 * through the walk instead of recomputing — a change confined to this file.
 */
export function pickNode(root: Node2D, point: Vector2, tolerance = 0): NodeBox | null {
    return pickIn(root, "", point, tolerance, true);
}

function pickIn(node: Node2D, path: string, point: Vector2, tolerance: number, isRoot: boolean): NodeBox | null {
    if (node.opacity === 0) return null;

    const inside = containsPoint(node, point, tolerance);
    // A clipping node (or one that opens a camera viewport) gates its subtree.
    if (!inside && node._confinesChildren()) return null;

    // A `Canvas3D`'s children come in both dimensions, and its 2D ones are
    // indexed against the *whole* list — see {@link childSlots}.
    const children = childSlots(node);
    for (let i = children.length - 1; i >= 0; i--) {
        const slot = children[i];
        if (slot === null) continue;
        const hit = pickIn(slot, nodePath(path, i), point, tolerance, false);
        if (hit) return hit;
    }

    // The 3D scene draws under the 2D children and over the canvas's own fill, so
    // it is tested in that order too: a HUD label wins over the mesh behind it,
    // and the mesh wins over the viewport it sits in.
    if (node instanceof Canvas3D && inside) {
        const hit = pickNode3D(node, canvas3DFrame(node, path), point, tolerance, path);
        if (hit) return hit;
    }

    if (isRoot) return null;
    return inside ? nodeBox(node, path) : null;
}

/**
 * Collect every visible node's box in draw order (parents before children, so a
 * host can paint them in the order the renderer did). Skips `opacity: 0` nodes
 * and the scene root, matching {@link pickNode}.
 *
 * A `Canvas3D` also contributes a box per `Node3D` inside it, projected into its
 * plane — see `node-picking3d.ts`. They sit after the viewport's own box and
 * before its 2D children's, which is where the 3D pass is painted; among
 * themselves they are ordered **near camera first**, because a 3D scene has no
 * draw order of its own for them to be in.
 */
export function collectBoxes(node: Node2D, path: string, out: NodeBox[], isRoot: boolean): void {
    if (node.opacity === 0) return;
    if (!isRoot) out.push(nodeBox(node, path));

    if (node instanceof Canvas3D) {
        for (const box of collectBoxes3D(node, canvas3DFrame(node, path), path)) out.push(box);
    }

    const children = childSlots(node);
    for (let i = 0; i < children.length; i++) {
        const slot = children[i];
        if (slot !== null) collectBoxes(slot, nodePath(path, i), out, false);
    }
}

/**
 * The node's children as **index slots**, with a `null` wherever the slot holds
 * something this walk doesn't descend into.
 *
 * Everywhere but a `Canvas3D` this is just `children`, and the array is returned
 * untouched. A `Canvas3D` is the one node holding both dimensions, and its
 * `Node2D.children` drops the meshes — which would renumber its HUD children and
 * hand every one of them the path of an earlier sibling. So its slots are taken
 * from the authored list with the 3D ones blanked out: same indices as the
 * document, and the meshes reached through their own walk instead.
 */
function childSlots(node: Node2D): readonly (Node2D | null)[] {
    if (!(node instanceof Canvas3D)) return node.children;
    return node._allChildren.map((child) => (child instanceof Node2D ? child : null));
}

/** What the 3D walk needs to know about the viewport it is projecting into. */
function canvas3DFrame(canvas: Canvas3D, path: string): Canvas3DFrame {
    return { box: nodeBox(canvas, path), matrix: renderMatrix(canvas) };
}

/** Map `point` into `node`'s local space and ask the node whether it was hit. */
function containsPoint(node: Node2D, point: Vector2, tolerance: number): boolean {
    const inv = invert(renderMatrix(node));
    if (!inv) return false;                       // zero scale — nothing to hit
    // The render matrix works in canvas (y-down) space; `worldAnchors` flips y in
    // and back out, so the inverse does the same to land in the node's centred,
    // y-up local frame — the space `hitTestSelf` and the clip descriptors use.
    const p = applyToPoint(inv, { x: point.x, y: -point.y });
    return node._hitTestSelf({ x: p.x, y: -p.y }, tolerance);
}
