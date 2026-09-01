import { property } from "@/attributes/properties/decorator";
import { quaternionProperty } from "@/attributes/properties/typed";
import {
    resolveVector3,
    type Euler3, type EulerOrder, type Quaternion, type Vector3, type Vector3Input,
} from "@/render3d/vector3";
import type { RenderContext3D } from "@/render3d/render-context3d";
import type { Shadow3D, Transform3D } from "@/render3d/transform";
import { Node, type NodeConfig, type NodeDimension, type NodeProps } from "@/nodes/node/node";
import type { EasingFunction } from "@/tween/ease/type";
import type { TweenStepper } from "@/tween/stepper";

export interface Node3DProps extends NodeProps {
    /** Position in the parent's local space. A scalar sets all three axes. */
    position: Vector3Input;
    /** Position on one axis. The same names 2D uses, one dimension over. */
    x: number;
    y: number;
    z: number;
    /**
     * Euler rotation in **degrees**, matching 2D `rotation`. Ignored when
     * {@link quaternion} is set.
     */
    rotation: Vector3Input | Euler3;
    /** Rotation about one axis, in **degrees**. Same names as 2D's. */
    rotationX: number;
    rotationY: number;
    rotationZ: number;
    /** The order the Euler axes are applied in. Default `"XYZ"`. */
    rotationOrder: EulerOrder;
    /**
     * Rotation as a unit quaternion. Wins over {@link rotation} — use it for
     * tumbles where Euler interpolation would gimbal.
     */
    quaternion: Quaternion;
    /** Per-axis scale; a scalar scales uniformly. Default 1. */
    scale: Vector3Input;
    scaleX: number;
    scaleY: number;
    scaleZ: number;
    /**
     * World-space point to orient toward, applied after {@link position}. Wins
     * over both {@link rotation} and {@link quaternion}.
     */
    lookAt: Vector3Input | undefined;
    /** Hide without removing — the cached renderer object stays alive. */
    visible: boolean;
    /**
     * Shadow participation. Default `true`, so turning shadows on for the scene
     * turns them on. Pass `false` to opt out, or `"cast"`/`"receive"` for one half.
     */
    shadow: Shadow3D;
    /** Draw-order override, for tuning transparent sorting. */
    renderOrder: number;
}

/** The three axis props each vector prop distributes into, in order. */
const VECTOR_SUGAR: Readonly<Record<string, readonly [string, string, string]>> = {
    position: ["x", "y", "z"],
    rotation: ["rotationX", "rotationY", "rotationZ"],
    scale: ["scaleX", "scaleY", "scaleZ"],
};

/**
 * A thing in 3D space — the root of the 3D scene graph.
 *
 * The sibling of {@link Node2D}: same tree, same signals, same `to()`/`set()`/
 * `save()`/`restore()`, same refs, context and per-node clock, all inherited from
 * {@link Node}. What differs is the only thing that genuinely differs between the
 * two — how a node is placed and how it draws. There is no `width`, no `padding`,
 * no anchor and no flex here, because none of them mean anything for a mesh; a 3D
 * node's whole placement is its transform.
 *
 *   <Canvas3D>
 *       <Camera3D orbit={30} elevation={18} distance={6} />
 *       <AmbientLight3D intensity={0.4} />
 *       <Group3D ref={rig}>
 *           <Box3D width={2} cornerRadius={0.15} fill="tomato" />
 *       </Group3D>
 *   </Canvas3D>
 *
 *   yield* rig().to({ rotationY: 360, y: 1 }, 2);
 *
 * ── Axes are scalars, and vectors are sugar over them ─────────────────────────
 * `x`, `y`, `z`, `rotationX/Y/Z` and `scaleX/Y/Z` are the real signals, and they
 * are named exactly what 2D names them. `position`, `rotation` and `scale` are
 * distributed into those three, the way `Node2D` already distributes `size` into
 * `width`/`height` — so both spellings tween identically and there is one source
 * of truth for where a node is. That is what makes `to({ y: 3 })` work: with a
 * single vector signal it would have had nothing to interpolate on the other two
 * axes, which is exactly the trap that made every 3D scene restate coordinates it
 * did not mean to change.
 *
 * A `Node3D` only ever lives under a `Canvas3D` — the one node that holds both
 * dimensions. Parenting one to a `Rect` throws rather than silently drawing
 * nothing (see {@link Node.acceptsChild}).
 *
 * To write your own, override {@link renderSelf} and hand a `Graphics3D` to the
 * context — the exact shape of a custom 2D node's `renderSelf`:
 *
 *   class Blob3D extends Node3D {
 *       protected override renderSelf(ctx: RenderContext3D): void {
 *           ctx.draw(new Graphics3D().sphere({ radius: 1, fill: "red" }));
 *       }
 *   }
 */
export class Node3D<P extends Node3DProps = Node3DProps> extends Node<P> {
    get dimension(): NodeDimension { return "3d"; }

    @property({ default: 0 }) declare x: number;
    @property({ default: 0 }) declare y: number;
    @property({ default: 0 }) declare z: number;

    @property({ default: 0 }) declare rotationX: number;
    @property({ default: 0 }) declare rotationY: number;
    @property({ default: 0 }) declare rotationZ: number;
    @property({ default: "XYZ" }) declare rotationOrder: EulerOrder;

    @quaternionProperty() declare quaternion: Quaternion;

    @property({ default: 1 }) declare scaleX: number;
    @property({ default: 1 }) declare scaleY: number;
    @property({ default: 1 }) declare scaleZ: number;

    @property({ default: undefined }) declare lookAt: Vector3Input | undefined;
    @property({ default: true }) declare visible: boolean;
    @property({ default: true }) declare shadow: Shadow3D;
    @property({ default: 0 }) declare renderOrder: number;

    constructor(props?: NodeConfig<any, P>) {
        super(props);
        // Distributed before `initProps`, which only ever applies keys that are
        // registered signals — a `position` left in the bag would be dropped.
        this.initProps(distributeVectors(props) as NodeConfig<any, P>);
        this.adoptChildrenProp(props);
    }

    /** This node's position, composed from the axis signals. */
    get position(): Vector3 {
        return { x: this.x, y: this.y, z: this.z };
    }
    set position(value: Vector3Input) {
        this.set({ position: value } as never);
    }

    /** This node's Euler rotation in degrees, composed from the axis signals. */
    get rotation(): Euler3 {
        return { x: this.rotationX, y: this.rotationY, z: this.rotationZ, order: this.rotationOrder };
    }
    set rotation(value: Vector3Input | Euler3) {
        this.set({ rotation: value } as never);
    }

    /** This node's scale, composed from the axis signals. */
    get scale(): Vector3 {
        return { x: this.scaleX, y: this.scaleY, z: this.scaleZ };
    }
    set scale(value: Vector3Input) {
        this.set({ scale: value } as never);
    }

    /**
     * Distribute the vector sugar into axis props, then write as usual.
     *
     * Same shape as `Node2D.set`'s handling of `size`, and for the same reason:
     * `position` has no signal of its own, so it has to become three writes
     * before the generic loop runs. An explicitly stated axis in the same call
     * wins over the vector, which is what lets `{ position: p, y: 0 }` mean what
     * it reads like.
     */
    override set(props: { [K in keyof P]?: P[K] | (() => P[K]) }): void {
        super.set(distributeVectors(props) as typeof props);
    }

    /**
     * The tween half of the same rule. Expanded here rather than in the command
     * so `to({ position: [...] })` and `to({ x, y, z })` produce identical
     * steppers — one interpolating path, whichever way it was written.
     */
    override _prepareStep(to: Partial<P>, duration: number, easing?: EasingFunction): TweenStepper {
        return super._prepareStep(distributeVectors(to) as Partial<P>, duration, easing);
    }

    /**
     * This node's placement, as the renderer's own vocabulary.
     *
     * Sampled fresh every frame from the signal-backed props, so a tween moves the
     * object without anything here caching state between frames.
     *
     * `quaternion` is only emitted when it has been set away from identity: it
     * wins over `rotation` in a {@link Transform3D}, so always sending it would
     * make `rotation` silently do nothing.
     */
    protected transform3D(): Transform3D {
        const quaternion = this.quaternion as unknown as Quaternion;
        const identityQuaternion =
            quaternion.x === 0 && quaternion.y === 0 && quaternion.z === 0 && quaternion.w === 1;
        return {
            position: this.position,
            rotation: this.rotation,
            quaternion: identityQuaternion ? undefined : quaternion,
            scale: this.scale,
            lookAt: this.lookAt,
            visible: this.visible,
            shadow: this.shadow,
            renderOrder: this.renderOrder,
        };
    }

    /**
     * The transform that goes on this node's *group* — the scope its children
     * nest inside. Defaults to this node's own placement, which is right for
     * everything that lives at its own origin.
     *
     * A camera overrides it to identity and places itself instead: three aims a
     * camera's -Z at `lookAt` but a plain group's +Z, so hanging a camera's
     * placement on its group would point the shot backwards.
     */
    protected groupTransform(): Transform3D {
        return this.transform3D();
    }

    /**
     * Draw this node's own contribution to the scene — a `ctx.draw(graphics3D)`
     * for something with geometry, a `ctx.light(...)` for a light, nothing at all
     * for a plain {@link Group3D}. Children are recorded after it, nested inside
     * this node's transform.
     */
    protected renderSelf(ctx: RenderContext3D): void { }

    /**
     * Record this node and its subtree into `ctx`.
     *
     * An invisible node still opens its scope: `visible: false` is a renderer-side
     * flag on a live object rather than a removal, which is what lets a node be
     * hidden and shown again without its GPU resources being rebuilt. Skipping the
     * walk here would instead sweep the whole subtree out of the cache.
     */
    render(ctx: RenderContext3D): void {
        ctx.begin({ id: this.id, transform: this.groupTransform() });
        this.renderSelf(ctx);
        for (const child of this._children) {
            if (child instanceof Node3D) child.render(ctx);
        }
        ctx.end();
    }
}

/**
 * Expand `position`/`rotation`/`scale` in a prop bag into their axis props.
 *
 * Returns the bag untouched when it names none of them, so the common write path
 * allocates nothing. A **binding** expands into three bindings that each resolve
 * the vector and take one component — so `position={() => lift()}` stays as
 * reactive as it was, and a signal driving all three axes is still read once per
 * axis per frame rather than being frozen at bind time.
 */
function distributeVectors<T extends object>(props: T | undefined): T | undefined {
    if (!props) return props;

    let out: Record<string, unknown> | undefined;

    for (const key in VECTOR_SUGAR) {
        const value = (props as Record<string, unknown>)[key];
        if (value === undefined) continue;

        out ??= { ...(props as Record<string, unknown>) };
        delete out[key];

        const axes = VECTOR_SUGAR[key];

        if (typeof value === "function") {
            const read = value as () => Vector3Input;
            for (let i = 0; i < 3; i++) {
                const axis = axes[i];
                if (out[axis] !== undefined) continue;
                out[axis] = () => componentOf(resolveVector3(read()), i);
            }
            continue;
        }

        const vector = resolveVector3(value as Vector3Input);
        for (let i = 0; i < 3; i++) {
            const axis = axes[i];
            if (out[axis] === undefined) out[axis] = componentOf(vector, i);
        }

        // `order` rides on an Euler and has nowhere else to go.
        if (key === "rotation") {
            const order = (value as Euler3).order;
            if (order !== undefined && out.rotationOrder === undefined) out.rotationOrder = order;
        }
    }

    return (out as T) ?? props;
}

function componentOf(vector: Vector3, index: number): number {
    return index === 0 ? vector.x : index === 1 ? vector.y : vector.z;
}
