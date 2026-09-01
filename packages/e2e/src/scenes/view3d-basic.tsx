import {
    createScene, createSignal, easeInOut,
    Canvas3D, Camera3D, AmbientLight3D, DirectionalLight3D, Box3D,
} from 'motion-script';
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
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const spin = createSignal(0);

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

    yield* spin(180, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
