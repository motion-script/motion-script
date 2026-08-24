import { property } from "@/attributes/properties/decorator";
import { euler3Property, quaternionProperty, vector3Property } from "@/attributes/properties/typed";
import type { Euler3, Quaternion, Vector3, Vector3Input } from "@/render3d/vector3";
import type { RenderContext3D } from "@/render3d/render-context3d";
import type { Transform3D } from "@/render3d/transform";
import { Node, type NodeConfig, type NodeDimension, type NodeProps } from "@/nodes/node/node";

export interface Node3DProps extends NodeProps {
    /** Position in the parent's local space. A scalar sets all three axes. */
    position: Vector3Input;
    /**
     * Euler rotation in **degrees**, matching 2D `rotation`. Ignored when
     * {@link quaternion} is set.
     */
    rotation: Vector3Input | Euler3;
    /**
     * Rotation as a unit quaternion. Wins over {@link rotation} — use it for
     * tumbles where Euler interpolation would gimbal.
     */
    quaternion: Quaternion;
    /** Per-axis scale; a scalar scales uniformly. Default 1. */
    scale: Vector3Input;
    /**
     * World-space point to orient toward, applied after {@link position}. Wins
     * over both {@link rotation} and {@link quaternion}.
     */
    lookAt: Vector3Input | undefined;
    /** Hide without removing — the cached renderer object stays alive. */
    visible: boolean;
    castShadow: boolean;
    receiveShadow: boolean;
    /** Draw-order override, for tuning transparent sorting. */
    renderOrder: number;
}

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
 *       <PerspectiveCamera3D position={[0, 2, 6]} lookAt={0} />
 *       <AmbientLight3D intensity={0.4} />
 *       <Group3D ref={rig}>
 *           <Box3D width={2} color="tomato" />
 *       </Group3D>
 *   </Canvas3D>
 *
 *   yield* rig().to({ rotation: [0, 360, 0] }, 2);
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
 *           ctx.draw(new Graphics3D().sphere({ radius: 1, color: "red" }));
 *       }
 *   }
 */
export class Node3D<P extends Node3DProps = Node3DProps> extends Node<P> {
    get dimension(): NodeDimension { return "3d"; }

    @vector3Property() declare position: Vector3Input;
    @euler3Property() declare rotation: Vector3Input | Euler3;
    @quaternionProperty() declare quaternion: Quaternion;
    @vector3Property({ default: 1 }) declare scale: Vector3Input;
    @property({ default: undefined }) declare lookAt: Vector3Input | undefined;
    @property({ default: true }) declare visible: boolean;
    @property({ default: false }) declare castShadow: boolean;
    @property({ default: false }) declare receiveShadow: boolean;
    @property({ default: 0 }) declare renderOrder: number;

    constructor(props?: NodeConfig<any, P>) {
        super(props);
        this.initProps(props);
        this.adoptChildrenProp(props);
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
            position: this.position as unknown as Vector3,
            rotation: this.rotation as unknown as Euler3,
            quaternion: identityQuaternion ? undefined : quaternion,
            scale: this.scale as unknown as Vector3,
            lookAt: this.lookAt,
            visible: this.visible,
            castShadow: this.castShadow,
            receiveShadow: this.receiveShadow,
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
