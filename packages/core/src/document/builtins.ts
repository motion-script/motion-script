import type { Fill } from "@/attributes/shape/fill/chain";
import type { Shadow } from "@/attributes/shape/shadow/resolver";
import type { Stroke } from "@/attributes/shape/stroke/mapper";
import type { Vector2 } from "@/attributes/layout/vector2";
import { driveCommand, type Command } from "@/tween/command";
import type { EasingFunction } from "@/tween/ease/type";
import type { Node } from "@/nodes/node/node";
import type { Node2D } from "@/nodes/2d/node2d";

import { BooleanGroup } from "@/nodes/geometry/boolean-node";
import { Ellipse } from "@/nodes/geometry/ellipse-node";
import { Grid } from "@/nodes/geometry/grid-node";
import { GridPattern } from "@/nodes/geometry/grid-pattern-node";
import { Line } from "@/nodes/geometry/line-node";
import { LineGrid } from "@/nodes/geometry/line-grid-node";
import { MaskGroup } from "@/nodes/geometry/mask-node";
import { Path } from "@/nodes/geometry/path-node";
import { Polygon } from "@/nodes/geometry/polygon-node";
import { Polygram } from "@/nodes/geometry/polygram-node";
import { Rect } from "@/nodes/geometry/rect-node";
import { Camera } from "@/nodes/layout/camera-node";
import { Column } from "@/nodes/layout/column-node";
import { RotatedBox } from "@/nodes/layout/rotated-box";
import { Row } from "@/nodes/layout/row-node";
import { Image } from "@/nodes/media/image-node";
import { Video } from "@/nodes/media/video-node";
import { Canvas2D } from "@/nodes/scene/canvas2d-node";
import { Provider } from "@/nodes/scene/provider-node";
import { ThemeProvider } from "@/nodes/scene/theme-provider-node";
import { DefaultTextStyle } from "@/nodes/text/default-text-style-node";
import { NumberNode } from "@/nodes/text/number-node";
import { RichText } from "@/nodes/text/richtext-node";
import { Text } from "@/nodes/text/text-node";
import { Canvas3D } from "@/nodes/three/canvas3d-node";
import { Group3D } from "@/nodes/three/group3d";
import { Mesh3D } from "@/nodes/three/mesh3d";
import {
    Box3D, Capsule3D, Circle3D, Cone3D, Cylinder3D, Extrude3D, Lathe3D,
    Plane3D, Polyhedron3D, Ring3D, Sphere3D, Torus3D, TorusKnot3D, Tube3D,
} from "@/nodes/three/geometry-nodes";
import { Instances3D, Line3D, Model3D, Points3D, Sprite3D } from "@/nodes/three/drawable-nodes";
import {
    AmbientLight3D, AreaLight3D, DirectionalLight3D, HemisphereLight3D,
    PointLight3D, SpotLight3D,
} from "@/nodes/three/light-nodes";
import { Camera3D } from "@/nodes/three/camera-nodes";
import { Environment3D, Fog3D } from "@/nodes/three/environment-nodes";

import {
    registerCommandType,
    registerNodeCommand,
    registerNodeType,
    type NodeConstructor,
} from "./registry";

/**
 * Registration of everything `@motion-script/core` itself ships.
 *
 * The keys here are **document API**. A stored scene names its nodes and its
 * animations with these strings, so renaming one silently breaks every document
 * that used it — they are as much a public contract as an exported symbol, and
 * are deliberately spelled out rather than derived from `constructor.name`
 * (which a minifier is free to mangle).
 */

/** Every built-in node type, keyed as a document names it. */
const NODE_TYPES: Record<string, NodeConstructor> = {
    // Scene root and structural
    canvas2d: Canvas2D as unknown as NodeConstructor,
    provider: Provider as unknown as NodeConstructor,
    "theme-provider": ThemeProvider as unknown as NodeConstructor,
    "default-text-style": DefaultTextStyle as unknown as NodeConstructor,

    // Geometry
    rect: Rect as unknown as NodeConstructor,
    ellipse: Ellipse as unknown as NodeConstructor,
    line: Line as unknown as NodeConstructor,
    path: Path as unknown as NodeConstructor,
    polygon: Polygon as unknown as NodeConstructor,
    polygram: Polygram as unknown as NodeConstructor,
    grid: Grid as unknown as NodeConstructor,
    "line-grid": LineGrid as unknown as NodeConstructor,
    "grid-pattern": GridPattern as unknown as NodeConstructor,
    boolean: BooleanGroup as unknown as NodeConstructor,
    mask: MaskGroup as unknown as NodeConstructor,

    // Layout
    row: Row as unknown as NodeConstructor,
    column: Column as unknown as NodeConstructor,
    camera: Camera as unknown as NodeConstructor,
    "rotated-box": RotatedBox as unknown as NodeConstructor,

    // Text
    text: Text as unknown as NodeConstructor,
    richtext: RichText as unknown as NodeConstructor,
    number: NumberNode as unknown as NodeConstructor,

    // Media
    image: Image as unknown as NodeConstructor,
    video: Video as unknown as NodeConstructor,

    // 3D — the viewport, then the tree that lives inside it
    canvas3d: Canvas3D as unknown as NodeConstructor,
    group3d: Group3D as unknown as NodeConstructor,
    mesh3d: Mesh3D as unknown as NodeConstructor,
    box3d: Box3D as unknown as NodeConstructor,
    sphere3d: Sphere3D as unknown as NodeConstructor,
    plane3d: Plane3D as unknown as NodeConstructor,
    circle3d: Circle3D as unknown as NodeConstructor,
    cylinder3d: Cylinder3D as unknown as NodeConstructor,
    cone3d: Cone3D as unknown as NodeConstructor,
    capsule3d: Capsule3D as unknown as NodeConstructor,
    torus3d: Torus3D as unknown as NodeConstructor,
    "torus-knot3d": TorusKnot3D as unknown as NodeConstructor,
    tube3d: Tube3D as unknown as NodeConstructor,
    lathe3d: Lathe3D as unknown as NodeConstructor,
    extrude3d: Extrude3D as unknown as NodeConstructor,
    ring3d: Ring3D as unknown as NodeConstructor,
    polyhedron3d: Polyhedron3D as unknown as NodeConstructor,
    points3d: Points3D as unknown as NodeConstructor,
    line3d: Line3D as unknown as NodeConstructor,
    sprite3d: Sprite3D as unknown as NodeConstructor,
    instances3d: Instances3D as unknown as NodeConstructor,
    model3d: Model3D as unknown as NodeConstructor,
    camera3d: Camera3D as unknown as NodeConstructor,
    "ambient-light3d": AmbientLight3D as unknown as NodeConstructor,
    "directional-light3d": DirectionalLight3D as unknown as NodeConstructor,
    "point-light3d": PointLight3D as unknown as NodeConstructor,
    "spot-light3d": SpotLight3D as unknown as NodeConstructor,
    "hemisphere-light3d": HemisphereLight3D as unknown as NodeConstructor,
    "area-light3d": AreaLight3D as unknown as NodeConstructor,
    fog3d: Fog3D as unknown as NodeConstructor,
    environment3d: Environment3D as unknown as NodeConstructor,
};

/** A node method that takes `(…args, duration, easing)` — the common shape. */
type EasedMethod = (...args: unknown[]) => Command<Record<string, unknown>>;

/**
 * Call a `(to, duration, options)` command — the paint family.
 *
 * `fillTo`/`overlayTo`/`strokeTo`/`shadowTo` take `TweenOptions` where the rest
 * take a bare `EasingFunction`, because a paint tween can also carry a custom
 * lerp. The document says `easing`, so it is folded into `options.ease` here
 * rather than making every author know which family a command belongs to.
 */
function paintCommand(method: string, argKey: string) {
    return (
        target: Node,
        params: Record<string, unknown>,
        duration: number,
        easing?: EasingFunction,
    ): Command<Record<string, unknown>> => {
        const fn = (target as unknown as Record<string, unknown>)[method];
        if (typeof fn !== "function") {
            throw new Error(
                `Command "${method}" is not available on ${target.constructor.name}.`,
            );
        }
        return (fn as EasedMethod).call(
            target,
            params[argKey],
            duration,
            easing ? { ease: easing } : undefined,
        );
    };
}

let registered = false;

/**
 * Register core's node and command vocabulary.
 *
 * Idempotent, and called from the package barrel rather than at module scope in
 * each node file: `sideEffects: false` would let a module-scope registration be
 * tree-shaken away, and the failure mode — every document reporting "unknown
 * node type rect" — points nowhere near the cause.
 */
export function registerBuiltins(): void {
    if (registered) return;
    registered = true;

    for (const [key, ctor] of Object.entries(NODE_TYPES)) {
        registerNodeType(key, ctor);
    }

    // ── Structural ───────────────────────────────────────────────────────────
    // These change *which nodes exist* rather than what their props hold, so
    // they produce no Command at all — the timeline reads them as presence (see
    // `presenceOf`) and the compiler skips them.
    const noop = (): Command<Record<string, unknown>> =>
        driveCommand(0, () => { }) as unknown as Command<Record<string, unknown>>;
    registerCommandType("add", noop, { structural: true });
    registerCommandType("remove", noop, { structural: true });

    // ── Props ────────────────────────────────────────────────────────────────
    registerCommandType("to", (target, params, duration, easing) =>
        (target as Node2D).to(
            (params.props ?? {}) as Record<string, never>,
            duration,
            easing,
        ) as unknown as Command<Record<string, unknown>>);

    // A stamp: write props with no tween. `duration` is ignored, which is what
    // makes it usable as the "set this here" a keyframe editor needs.
    registerCommandType("set", (target, params) => {
        const props = (params.props ?? {}) as Record<string, never>;
        return driveCommand(0, () => {
            (target as Node2D).set(props);
        }) as unknown as Command<Record<string, unknown>>;
    });

    // ── Transform (Node2D) ───────────────────────────────────────────────────
    registerNodeCommand("moveTo", "moveTo", ["x", "y"]);
    registerNodeCommand("fadeTo", "fadeTo", ["opacity"]);
    registerNodeCommand("rotateTo", "rotateTo", ["rotation"]);
    registerNodeCommand("scaleTo", "scaleTo", ["scale"]);

    // ── Paint (ShapeNode / Canvas2D) ─────────────────────────────────────────
    registerCommandType("fillTo", paintCommand("fillTo", "fill"));
    registerCommandType("overlayTo", paintCommand("overlayTo", "overlay"));
    registerCommandType("strokeTo", paintCommand("strokeTo", "stroke"));
    registerCommandType("shadowTo", paintCommand("shadowTo", "shadow"));

    // ── Camera (Canvas2D / Camera) ───────────────────────────────────────────
    registerNodeCommand("zoomTo", "zoomTo", ["zoom"]);
    registerNodeCommand("panTo", "panTo", ["lookAt"]);
    registerNodeCommand("headingTo", "headingTo", ["heading"]);

    // ── Text ─────────────────────────────────────────────────────────────────
    registerNodeCommand("countTo", "countTo", ["value"]);
    registerNodeCommand("append", "append", ["text"]);
    registerNodeCommand("prepend", "prepend", ["text"]);

    // ── State ────────────────────────────────────────────────────────────────
    // `restore` pops the layer a `save` pushed. Both are commands so the pair is
    // placed on the timeline like anything else, and a seek past the save still
    // produces the same frame — the value is computed from the chain rather than
    // accumulated as the playhead moves.
    registerCommandType("save", (target) =>
        driveCommand(0, () => {
            (target as Node2D).save();
        }) as unknown as Command<Record<string, unknown>>);
    registerNodeCommand("restore", "restore", []);
}

/** Type-only re-exports, so a caller writing params gets the same shapes. */
export type { Fill, Shadow, Stroke, Vector2 };
