import {
    createSignal, easeInOut,
    Canvas3D, Camera3D, AmbientLight3D, DirectionalLight3D, Box3D } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * The baseline 3D render: a lit box rotating inside a `Canvas3D`.
 *
 * Covers the whole 3D path in one frame — the `Node3D` tree recording into a
 * `Scene3D`, the reconciler building a three scene from it, the platform renderer
 * rasterizing that, and the result being uploaded and shaded through the shape's
 * own fill. Deliberately plain (one box, one light, a fixed camera) so a diff here
 * means the *pipeline* changed, not the scene.
 *
 * Rotation is driven by a tweened signal rather than a clock read, so the frame
 * at a given index is identical whether it was played or seeked to — which is
 * what makes it comparable at all.
 */
const spin = createSignal(0);
export default scene((stage) => {
    // Re-seeded here, not just at construction: these signals outlive a build,
    // and a scene is built more than once per render. A tween snapshots its
    // `from` the first time it is evaluated, so without this the second build
    // would start from where the first one ended and animate nothing.
    spin.set(0);
    stage.set({ fill: 'bg' });

    stage.add(
        <Canvas3D width={480} height={320} cornerRadius={16}>
            <Camera3D position={[0, 1.6, 5]} target={0} fov={45} />
            <AmbientLight3D intensity={0.35} />
            <DirectionalLight3D intensity={2.2} position={[3, 5, 4]} />
            <Box3D
                width={2} height={2} depth={2}
                fill="#e0533d" roughness={0.4} metalness={0.1}
                rotation={() => [0, spin(), 0]}
            />
        </Canvas3D>,
    );
}, [
    () => spin(180, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
