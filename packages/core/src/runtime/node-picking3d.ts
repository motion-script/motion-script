import { Node } from "@/nodes/node/node";
import { Node3D } from "@/nodes/three/node3d";
import { Canvas3D } from "@/nodes/three/canvas3d-node";
import type { Vector2 } from "@/attributes/layout/vector2";
import { applyToPoint, invert, type Matrix2D } from "@/attributes/layout/matrix2d";
import type { CameraData3D } from "@/render3d/camera";
import type { Scene3D, Scene3DOp } from "@/render3d/scene3d";
import type { Transform3D } from "@/render3d/transform";
import {
    geometryBounds3D, transformBox3, unionBox3, centeredBox3, corners3, type Box3,
} from "@/render3d/bounds3d";
import {
    applyMatrix4, identity4, invert4, lookAtRotation4, multiply4, orthographic4,
    perspective4, transformMatrix4, translation4, type Matrix4,
} from "@/render3d/matrix4";
import { resolveVector3, type Vector3 } from "@/render3d/vector3";
import { nodePath } from "@/project/tree";
import type { NodeBox } from "./node-picking";

/**
 * Where a `Node3D`'s pixels landed — the 3D half of `node-picking.ts`, and the
 * reason an editor can put a selection box round a cube at all.
 *
 * **The answer is a 2D box, deliberately.** A mesh has no rectangle in it: what
 * it has is an extent in three dimensions, seen through a camera. So this
 * projects the node's world-space AABB into the `Canvas3D`'s own plane and takes
 * the **screen-space AABB of the result** — the box that encloses the shape as
 * drawn, from wherever the camera happens to be. That is the same box every 3D
 * editor draws for the same reason: an oriented box in 3D read as a hexagon on
 * screen, and nothing you could grab on it would mean anything in two
 * dimensions.
 *
 * Because it is a 2D box in the canvas's plane, it composes with everything the
 * 2D side already does — the canvas's own rotation, its ancestors', a camera
 * scope above it — by being handed the canvas's `renderMatrix` and mapped
 * through it exactly as {@link nodeBox} maps a node's corners. Nothing here has
 * to know what is above the canvas.
 *
 * **Two walks, joined on the node id.** Bounds come from the recorded
 * {@link Scene3D} rather than from the node tree, because the scene is the seam
 * everything else goes through (the render and the asset pass both build it) and
 * a node that draws through a custom `renderSelf` is measured correctly for
 * free. Paths come from the tree, because a path is a child *index* and ops
 * don't carry one. The two meet on `Node3D.id`, which the scene records as the
 * `key` on every `push`.
 *
 * **Nothing here imports `node-picking.ts` at runtime.** The canvas's own box
 * and CTM arrive as a {@link Canvas3DFrame} parameter instead, so the dependency
 * runs one way — the 2D walk reaches into this file and never the reverse. The
 * `NodeBox` import is type-only and erased.
 *
 * Two things a caller should know about what it gets back. A box is **not
 * clipped to the viewport**: a mesh that has drifted off the side of its canvas
 * reports where it went, even though the 3D pass is confined to the rect and no
 * pixels of it are drawn. That is the honest answer for an overlay saying where
 * a node is, and it costs the picker nothing — {@link pickIn} only consults this
 * file for a point already inside the rect.
 *
 * And the cost: every entry point here records the scene afresh, so a pick or a
 * box walk pays one `buildScene3D()` per viewport it touches. That is the same
 * pass the render and the asset declaration each make every frame, and 3D scene
 * trees are small, so it is fine at pointer rate — but a host calling
 * {@link collectBoxes} on every pointer move over a document full of viewports
 * is paying it per viewport per move.
 */

/** What the 2D walk already knows about the canvas, handed down. */
/** @internal */
export interface Canvas3DFrame {
    /**
     * The canvas's own box. Its folded `rotation`/`scale`/`opacity` carry to
     * every 3D node inside it — a mesh has none of its own, and what an editor
     * needs those for (cursor angles, pixels-per-unit) is a question about the
     * plane the box is drawn in.
     */
    box: NodeBox;
    /** `renderMatrix(canvas)` — the canvas's CTM, canvas y-down. */
    matrix: Matrix2D;
}

/**
 * Every 3D node's box inside `canvas`, **nearest camera first**.
 *
 * Depth order rather than draw order, which is the one place this diverges from
 * {@link collectBoxes}: a 3D scene has no draw order to speak of (the renderer
 * sorts by depth and the depth buffer settles the rest), so "topmost" means
 * "nearest", and a picker walking this list front-to-back gets the node you can
 * actually see.
 *
 * Empty when the scene has no camera that resolves, when the canvas has no size,
 * or when nothing in it can be measured — see {@link geometryBounds3D} for the
 * last of those.
 */
/** @internal */
export function collectBoxes3D(canvas: Canvas3D, frame: Canvas3DFrame, path: string): NodeBox[] {
    const projection = canvas3DProjection(canvas);
    if (!projection) return [];

    const out: { box: NodeBox; depth: number }[] = [];
    for (const entry of nodes3DOf(canvas, path)) {
        const world = projection.boxes.get(entry.node.id);
        if (!world) continue;
        const projected = projectBox3(world, projection);
        if (!projected) continue;
        out.push({
            box: toNodeBox(entry.node, entry.path, projected.rect, frame),
            depth: projected.depth,
        });
    }
    // View space looks down −Z, so a nearer node has the larger (less negative)
    // z — descending puts the front of the scene first.
    out.sort((a, b) => b.depth - a.depth);
    return out.map((entry) => entry.box);
}

/**
 * Where a handful of arbitrary points around one `Node3D` land on screen — the
 * ingredient a box can't supply for a gizmo.
 *
 * `origin`, `parentPoints` and `localPoints` all come back in the **same
 * viewport space** {@link NodeBox} does, so a caller drawing both together
 * (a box for the outline, this for the handles) never has two coordinate
 * systems to reconcile. A `null` entry means that point sits behind the
 * camera — mirrors {@link projectBox3}'s own eye-plane guard, just per point
 * instead of per clipped edge, since there's no box to keep in shape here.
 *
 * Not `@internal`, unlike {@link projectNode3D} itself: this is what a host
 * gets back from `projectNode3DAt`/`PlaybackController.projectNode3D`, the
 * same public tier as {@link NodeBox}.
 */
export interface Node3DFrame {
    /** The node's own position, projected — a gizmo's pivot. */
    origin: Vector2 | null;
    /**
     * `parentPoints` transformed by the node's **parent's** world matrix, then
     * projected. The frame `Node3DProps.position` is itself expressed in, so
     * this is the space a move or scale handle belongs in: a point named
     * `{ ...position, x: position.x + 1 }` projects to where nudging `x` by
     * one unit would actually land, with no need to know whether "one unit"
     * means local or world space at the point of asking.
     */
    parentPoints: (Vector2 | null)[];
    /**
     * `localPoints` transformed by the node's **own** world matrix, then
     * projected. For geometry that has to track the node's current
     * orientation — a rotation ring wrapping the mesh as it's actually
     * turned, not as it started.
     */
    localPoints: (Vector2 | null)[];
}

const ORIGIN_3D: Vector3 = { x: 0, y: 0, z: 0 };

/**
 * Project `parentPoints`/`localPoints` for the `Node3D` at `targetPath`
 * inside `canvas`, or `null` when the canvas has no projection (see
 * {@link canvas3DProjection}) or the path doesn't resolve to a node in it.
 *
 * `canvasPath` is the canvas's own structural path — the same root
 * {@link collectBoxes3D} and {@link pickNode3D} are handed — and `targetPath`
 * the node being projected, found the same way {@link nodeBoxAt} finds one
 * (`node-picking.ts`, one level up).
 */
/** @internal */
export function projectNode3D(
    canvas: Canvas3D,
    frame: Canvas3DFrame,
    canvasPath: string,
    targetPath: string,
    parentPoints: readonly Vector3[],
    localPoints: readonly Vector3[],
): Node3DFrame | null {
    const projection = canvas3DProjection(canvas);
    if (!projection) return null;

    const entry = nodes3DOf(canvas, canvasPath).find((e) => e.path === targetPath);
    if (!entry) return null;

    const own = projection.matrices.get(entry.node.id);
    const parent = projection.parentMatrices.get(entry.node.id);
    if (!own || !parent) return null;

    const project = (matrix: Matrix4, points: readonly Vector3[]): (Vector2 | null)[] =>
        points.map((point) => projectPoint3(matrix, point, projection, frame));

    return {
        origin: projectPoint3(own, ORIGIN_3D, projection, frame),
        parentPoints: project(parent, parentPoints),
        localPoints: project(own, localPoints),
    };
}

/**
 * `point` (in whatever space `matrix` maps to world space) projected into
 * `frame`'s viewport space, or `null` when it lands behind the camera.
 *
 * The single-point sibling of {@link projectBox3}: no edges to clip, so a
 * point either has a clip-space `w` in front of the eye or it doesn't.
 */
function projectPoint3(
    matrix: Matrix4,
    point: Vector3,
    projection: Canvas3DProjection,
    frame: Canvas3DFrame,
): Vector2 | null {
    const world = applyMatrix4(matrix, point);
    const clip = applyMatrix4(projection.clip, { x: world.x, y: world.y, z: world.z });
    if (clip.w <= MIN_CLIP_W) return null;

    const ndcX = clip.x / clip.w;
    const ndcY = clip.y / clip.w;
    const rectX = projection.centerX + ndcX * (projection.width / 2);
    const rectY = projection.centerY + ndcY * (projection.height / 2);

    const p = applyToPoint(frame.matrix, { x: rectX, y: -rectY });
    return { x: p.x, y: -p.y };
}

/**
 * The nearest 3D node in `canvas` whose box contains `point` (viewport space,
 * y-up), or `null`.
 *
 * The box, not the mesh — the module note says why there is no mesh-accurate
 * answer to give. `tolerance` is grab-slop in scene units, applied in the
 * canvas's own plane so it stays the constant on-screen distance the caller
 * quoted it as.
 */
/** @internal */
export function pickNode3D(
    canvas: Canvas3D,
    frame: Canvas3DFrame,
    point: Vector2,
    tolerance: number,
    path: string,
): NodeBox | null {
    const projection = canvas3DProjection(canvas);
    if (!projection) return null;

    // Into the canvas's own plane, undoing everything above it in one step —
    // the same inverse `containsPoint` takes, with the same y-flips in and out.
    const inverse = invert(frame.matrix);
    if (!inverse) return null;
    const mapped = applyToPoint(inverse, { x: point.x, y: -point.y });
    const local = { x: mapped.x, y: -mapped.y };

    let best: { node: Node3D; path: string; rect: Rect2D } | null = null;
    let bestDepth = -Infinity;
    for (const entry of nodes3DOf(canvas, path)) {
        const world = projection.boxes.get(entry.node.id);
        if (!world) continue;
        const projected = projectBox3(world, projection);
        if (!projected) continue;
        if (!rectContains(projected.rect, local, tolerance)) continue;
        if (projected.depth <= bestDepth) continue;
        bestDepth = projected.depth;
        best = { node: entry.node, path: entry.path, rect: projected.rect };
    }
    return best ? toNodeBox(best.node, best.path, best.rect, frame) : null;
}

// ─── The tree walk: which node is at which path ──────────────────────────────

interface Node3DEntry {
    node: Node3D;
    path: string;
}

/**
 * Every `Node3D` under `canvas`, with the structural path it sits at.
 *
 * Indexed against {@link Node._allChildren} rather than `children`, so a mesh
 * and a HUD label under the same viewport are numbered the way the author wrote
 * them — see the accessor's own note for what goes wrong otherwise.
 */
function nodes3DOf(canvas: Canvas3D, path: string): Node3DEntry[] {
    const out: Node3DEntry[] = [];
    walk3D(canvas._allChildren, path, out);
    return out;
}

function walk3D(children: readonly Node[], parentPath: string, out: Node3DEntry[]): void {
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (!(child instanceof Node3D)) continue;
        const path = nodePath(parentPath, i);
        out.push({ node: child, path });
        walk3D(child._allChildren, path, out);
    }
}

// ─── The op walk: how big each node is, and where it is looked at from ───────

/** Everything the projection needs, resolved once per call. */
interface Canvas3DProjection {
    /** World-space bounds per `Node3D.id`, each including its subtree. */
    boxes: Map<string, Box3>;
    /** Each node's own world matrix, per `Node3D.id` — see {@link Node3DFrame}. */
    matrices: Map<string, Matrix4>;
    /** Each node's *parent's* world matrix, keyed by the node's own id. */
    parentMatrices: Map<string, Matrix4>;
    /** `projection · view` — world space straight to clip space. */
    clip: Matrix4;
    /** The view matrix alone, for the depth sort. */
    view: Matrix4;
    /** The canvas's local rect, which the 3D buffer is stretched onto. */
    width: number;
    height: number;
    centerX: number;
    centerY: number;
}

function canvas3DProjection(canvas: Canvas3D): Canvas3DProjection | null {
    const bounds = canvas._localBounds();
    if (!(bounds.width > 0) || !(bounds.height > 0)) return null;

    const scene = canvas._scene3D();
    const walked = walkScene3D(scene);
    if (walked.boxes.size === 0) return null;

    const view = invert4(walked.camera);
    if (!view) return null;

    const aspect = bounds.width / bounds.height;
    return {
        boxes: walked.boxes,
        matrices: walked.matrices,
        parentMatrices: walked.parentMatrices,
        clip: multiply4(projectionMatrix(walked.descriptor, aspect), view),
        view,
        width: bounds.width,
        height: bounds.height,
        centerX: bounds.x,
        centerY: bounds.y,
    };
}

/** One open `push` scope: where it is, whether it draws, and what it has drawn. */
interface Scope3D {
    key: string | undefined;
    matrix: Matrix4;
    visible: boolean;
    box: Box3 | null;
}

interface WalkedScene3D {
    boxes: Map<string, Box3>;
    /** Each node's own world matrix, per `Node3D.id` — captured at `push`,
     * unlike `boxes`, which needs children merged in first at `pop`. */
    matrices: Map<string, Matrix4>;
    /** Each node's *parent's* world matrix, keyed by the node's own id. */
    parentMatrices: Map<string, Matrix4>;
    /** The camera's world matrix, or the renderer's own framing when none was set. */
    camera: Matrix4;
    descriptor: CameraData3D | null;
}

/**
 * Replay the recorded scene, accumulating a world-space box per node.
 *
 * A node's box is the union of everything it drew and everything its children
 * drew, which is what makes a `Group3D` — which draws nothing itself — still
 * selectable as the thing it contains.
 *
 * An invisible scope contributes nothing and is recorded for nobody: `visible:
 * false` is a live object the renderer skips, so there are no pixels to put a
 * box round, and letting one inflate its parent's box would put that parent's
 * box round empty space. The 2D walk skips `opacity: 0` nodes on the same
 * grounds.
 */
function walkScene3D(scene: Scene3D): WalkedScene3D {
    const boxes = new Map<string, Box3>();
    const matrices = new Map<string, Matrix4>();
    const parentMatrices = new Map<string, Matrix4>();
    const root: Scope3D = { key: undefined, matrix: identity4(), visible: true, box: null };
    const stack: Scope3D[] = [root];
    let camera: Matrix4 | null = null;
    let descriptor: CameraData3D | null = null;

    const top = (): Scope3D => stack[stack.length - 1];

    for (const op of scene.ops()) {
        const scope = top();
        switch (op.kind) {
            case "push": {
                const matrix = scopeMatrix(scope.matrix, op.transform);
                if (op.transform?.key !== undefined) {
                    matrices.set(op.transform.key, matrix);
                    parentMatrices.set(op.transform.key, scope.matrix);
                }
                stack.push({
                    key: op.transform?.key,
                    matrix,
                    visible: scope.visible && op.transform?.visible !== false,
                    box: null,
                });
                break;
            }
            case "pop": {
                // The root frame is never popped: `Node3D.render` brackets its own
                // begin/end, and `Scene3D.assertBalanced` catches a hand-built
                // scene that doesn't. Guarding anyway keeps a malformed op list
                // from reading past the bottom of the stack.
                if (stack.length === 1) break;
                const closed = stack.pop() as Scope3D;
                if (!closed.visible || !closed.box) break;
                if (closed.key !== undefined) boxes.set(closed.key, closed.box);
                const parent = top();
                parent.box = unionBox3(parent.box, closed.box);
                break;
            }
            case "camera": {
                descriptor = op.camera;
                camera = cameraMatrix4(op.camera, scope.matrix);
                break;
            }
            case "light":
                // A light has no extent. A node that is only a light therefore
                // gets no box and cannot be picked on the canvas, which is the
                // honest answer — there is nothing on screen at its position.
                break;
            default: {
                if (!scope.visible) break;
                const drawn = drawableBox3(op, scope.matrix);
                if (drawn) scope.box = unionBox3(scope.box, drawn);
                break;
            }
        }
    }

    return {
        boxes,
        matrices,
        parentMatrices,
        camera: camera ?? DEFAULT_CAMERA_MATRIX,
        descriptor,
    };
}

/** A scope's world matrix: the parent's, composed with the node's own placement. */
function scopeMatrix(parent: Matrix4, transform: Transform3D | undefined): Matrix4 {
    return multiply4(parent, transformMatrix4(transform, parent));
}

/** The world box a single drawable op contributes, or `null` when it has none. */
function drawableBox3(op: Scene3DOp, parent: Matrix4): Box3 | null {
    if (op.kind === "model") return null; // its extent arrives with the file
    if (!("transform" in op)) return null;

    const matrix = scopeMatrix(parent, op.transform);

    if (op.kind === "sprite") {
        // A sprite is a camera-facing unit quad scaled by its transform — three's
        // `Sprite` has no geometry to ask, so this is the one place the extent is
        // assumed rather than read.
        return transformBox3(centeredBox3(0.5, 0.5, 0), matrix);
    }

    if (!("geometry" in op)) return null;
    const local = geometryBounds3D(op.geometry);
    if (!local) return null;

    if (op.kind === "instances") {
        // Every instance is placed inside the op's own transform, so the union is
        // taken in that space and mapped out once.
        let box: Box3 | null = null;
        for (const instance of op.instances) {
            box = unionBox3(box, transformBox3(local, transformMatrix4(instance, null)));
        }
        return box ? transformBox3(box, matrix) : null;
    }

    return transformBox3(local, matrix);
}

// ─── The camera ──────────────────────────────────────────────────────────────

/**
 * The camera's world matrix.
 *
 * `lookAt` takes the camera branch of three's `Object3D.lookAt` — **−Z** at the
 * target, where every other node aims its +Z — and is resolved against the
 * camera's *world* position, so a camera riding inside an animated rig points
 * where the author said rather than where its group happens to face. See
 * {@link lookAtRotation4}, which the two branches share.
 */
function cameraMatrix4(descriptor: CameraData3D, parent: Matrix4): Matrix4 {
    if (descriptor.lookAt === undefined) {
        return multiply4(parent, transformMatrix4(descriptor, parent));
    }
    const placed = applyMatrix4(parent, resolveVector3(descriptor.position));
    const origin: Vector3 = { x: placed.x, y: placed.y, z: placed.z };
    const target = resolveVector3(descriptor.lookAt);
    return multiply4(translation4(origin), lookAtRotation4(origin, target));
}

/**
 * Where the renderer looks from when a scene declares no camera: pulled back
 * along +Z, aimed at the origin. Mirrors `applyCamera`'s own fallback, which is
 * what makes a bare `g.box()` render something rather than a black frame — and
 * therefore what makes it pickable here.
 */
const DEFAULT_CAMERA_MATRIX: Matrix4 = multiply4(
    translation4({ x: 0, y: 0, z: 5 }),
    lookAtRotation4({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }),
);

/** three's default fov when a perspective descriptor omits one. */
const DEFAULT_FOV = 50;
const DEFAULT_NEAR = 0.1;
const DEFAULT_FAR = 1000;

/** The projection a descriptor asks for, framed to the canvas's aspect. */
function projectionMatrix(descriptor: CameraData3D | null, aspect: number): Matrix4 {
    if (descriptor === null) {
        return perspective4(DEFAULT_FOV, aspect, DEFAULT_NEAR, DEFAULT_FAR, 1);
    }
    if (descriptor.type === "perspective") {
        return perspective4(
            descriptor.fov ?? DEFAULT_FOV,
            descriptor.aspect ?? aspect,
            descriptor.near ?? DEFAULT_NEAR,
            descriptor.far ?? DEFAULT_FAR,
            descriptor.zoom ?? 1,
        );
    }
    // The same "explicit four edges win, otherwise `frustumHeight` and the node's
    // aspect" rule `applyCamera` applies — restated rather than shared because
    // that one lives in the renderer, which core cannot import.
    const explicit = descriptor.left !== undefined && descriptor.right !== undefined
        && descriptor.top !== undefined && descriptor.bottom !== undefined;
    const halfHeight = (descriptor.frustumHeight ?? 10) / 2;
    return orthographic4(
        explicit ? descriptor.left as number : -halfHeight * aspect,
        explicit ? descriptor.right as number : halfHeight * aspect,
        explicit ? descriptor.top as number : halfHeight,
        explicit ? descriptor.bottom as number : -halfHeight,
        descriptor.near ?? DEFAULT_NEAR,
        descriptor.far ?? DEFAULT_FAR,
        descriptor.zoom ?? 1,
    );
}

// ─── Projection ──────────────────────────────────────────────────────────────

/** An axis-aligned rect in the canvas's own plane, y-up. */
interface Rect2D {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** The twelve edges of {@link corners3}'s eight corners, as index pairs. */
const BOX_EDGES: readonly (readonly [number, number])[] = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
];

/**
 * Smallest `w` a projected point may have before it counts as behind the camera.
 * A point at `w = 0` is on the plane through the eye and projects to infinity.
 */
const MIN_CLIP_W = 1e-4;

/**
 * How far outside the canvas a projected box is allowed to reach, as a multiple
 * of the canvas's own size.
 *
 * A box straddling the eye plane genuinely does extend to the horizon, and the
 * arithmetic says so — a corner a millimetre in front of the camera projects
 * thousands of units out. That is the right answer and a useless one: the host
 * draws this, and an overlay rectangle a million pixels wide is a rendering
 * problem rather than a selection. Clamping keeps the box pointing the right way
 * while it is mostly off-screen, and it is only ever reached in the case where
 * the box is already unusable as a target.
 */
const OFFSCREEN_LIMIT = 8;

/**
 * The world box projected into the canvas's plane, plus its view-space depth.
 *
 * The **edges** are clipped rather than the corners being clamped: a box with
 * one corner behind the eye has that corner's projection reflected through the
 * origin, so bounding the raw eight would produce a box on the wrong side of the
 * screen. Clipping each edge where it crosses the eye plane gives the visible
 * span and nothing else. Entirely-behind boxes drop out with no edges surviving,
 * which is how a node behind the camera stops being selectable.
 */
function projectBox3(
    world: Box3,
    projection: Canvas3DProjection,
): { rect: Rect2D; depth: number } | null {
    const corners = corners3(world);
    const clip = corners.map((corner) => applyMatrix4(projection.clip, corner));

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let any = false;

    const include = (x: number, y: number, w: number) => {
        const ndcX = x / w;
        const ndcY = y / w;
        if (ndcX < minX) minX = ndcX;
        if (ndcY < minY) minY = ndcY;
        if (ndcX > maxX) maxX = ndcX;
        if (ndcY > maxY) maxY = ndcY;
        any = true;
    };

    for (const [a, b] of BOX_EDGES) {
        const p = clip[a];
        const q = clip[b];
        const pIn = p.w > MIN_CLIP_W;
        const qIn = q.w > MIN_CLIP_W;
        if (!pIn && !qIn) continue;
        if (pIn) include(p.x, p.y, p.w);
        if (qIn) include(q.x, q.y, q.w);
        if (pIn === qIn) continue;
        // Exactly one end is in front: cut the edge where `w` reaches the plane.
        const t = (MIN_CLIP_W - p.w) / (q.w - p.w);
        include(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, MIN_CLIP_W);
    }

    if (!any) return null;

    const halfWidth = projection.width / 2;
    const halfHeight = projection.height / 2;
    const limitX = halfWidth * OFFSCREEN_LIMIT;
    const limitY = halfHeight * OFFSCREEN_LIMIT;

    const rect: Rect2D = {
        minX: clamp(projection.centerX + minX * halfWidth, projection.centerX - limitX, projection.centerX + limitX),
        maxX: clamp(projection.centerX + maxX * halfWidth, projection.centerX - limitX, projection.centerX + limitX),
        minY: clamp(projection.centerY + minY * halfHeight, projection.centerY - limitY, projection.centerY + limitY),
        maxY: clamp(projection.centerY + maxY * halfHeight, projection.centerY - limitY, projection.centerY + limitY),
    };

    // Depth is taken at the box centre in view space, where the camera looks down
    // −Z: a nearer node has the larger value. One point rather than eight,
    // because what this orders is "which of two overlapping nodes did you mean",
    // and their centres answer that as well as their nearest corners would.
    const centre: Vector3 = {
        x: (world.min.x + world.max.x) / 2,
        y: (world.min.y + world.max.y) / 2,
        z: (world.min.z + world.max.z) / 2,
    };
    const viewed = applyMatrix4(projection.view, centre);

    return { rect, depth: viewed.z };
}

function clamp(value: number, low: number, high: number): number {
    return value < low ? low : value > high ? high : value;
}

/** Whether `point` (canvas-local, y-up) lands in `rect`, widened by `slop`. */
function rectContains(rect: Rect2D, point: Vector2, slop: number): boolean {
    return point.x >= rect.minX - slop
        && point.x <= rect.maxX + slop
        && point.y >= rect.minY - slop
        && point.y <= rect.maxY + slop;
}

/**
 * The projected rect as a {@link NodeBox}, in viewport space.
 *
 * The corner mapping is {@link worldAnchors}' — y flipped on the way in and back
 * out, because the CTM is canvas y-down while everything either side of it is
 * y-up. Doing it here rather than reusing `worldAnchors` is what lets the rect
 * keep its own centre: the box is axis-aligned in the canvas's plane but not
 * centred on the canvas's origin, and `worldAnchors` maps offsets from wherever
 * the matrix already is.
 *
 * `rotation`, `scale` and `opacity` are the **canvas's**. A mesh has none of its
 * own that mean anything in two dimensions — its `rotation` is three angles and
 * its opacity is its material's — and what a host reads these for is the plane
 * the box was drawn in, which is exactly what the canvas describes.
 */
function toNodeBox(node: Node3D, path: string, rect: Rect2D, frame: Canvas3DFrame): NodeBox {
    const at = (x: number, y: number): Vector2 => {
        const p = applyToPoint(frame.matrix, { x, y: -y });
        return { x: p.x, y: -p.y };
    };
    return {
        id: node.id,
        path,
        type: node.name,
        topLeft: at(rect.minX, rect.maxY),
        topRight: at(rect.maxX, rect.maxY),
        bottomRight: at(rect.maxX, rect.minY),
        bottomLeft: at(rect.minX, rect.minY),
        center: at((rect.minX + rect.maxX) / 2, (rect.minY + rect.maxY) / 2),
        width: rect.maxX - rect.minX,
        height: rect.maxY - rect.minY,
        rotation: frame.box.rotation,
        scale: frame.box.scale,
        opacity: frame.box.opacity,
    };
}
