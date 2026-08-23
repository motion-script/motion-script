import type { Node3DProps } from "./node3d";
import { Node3D } from "./node3d";

export type Group3DProps = Node3DProps;

/**
 * A transform with children and nothing of its own to draw — the 3D `<Rect>` that
 * only groups.
 *
 * Move, rotate or scale it and everything under it follows, which is what makes a
 * rig animatable as one thing:
 *
 *   <Group3D ref={rig} position={[0, 1, 0]}>
 *       <Box3D width={2} />
 *       <Sphere3D radius={0.8} position={[3, 0, 0]} />
 *   </Group3D>
 *
 *   yield* rig().to({ rotation: [0, 360, 0] }, 2);
 *
 * `Node3D` already draws nothing by default, so this adds no behaviour — it
 * exists to be named for what it is at the call site.
 */
export class Group3D<P extends Group3DProps = Group3DProps> extends Node3D<P> { }
