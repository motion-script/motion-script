import { createScene, createSignal, easeInOut, View3D, Graphics3D } from 'motion-script';
import { holdTail } from './_lib';

/**
 * The baseline 3D render: a lit box rotating inside a `View3D`.
 *
 * Covers the whole 3D path in one frame — the reconciler building a three scene
 * from `Graphics3D` data, the platform renderer rasterizing it, and the result
 * being uploaded and shaded through the shape's own fill. Deliberately plain
 * (one box, one light, a fixed camera) so a diff here means the *pipeline*
 * changed, not the scene.
 *
 * Rotation is driven by a tweened signal rather than a clock read, so the frame
 * at a given index is identical whether it was played or seeked to — which is
 * what makes it comparable at all.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const spin = createSignal(0);

    stage.add(
        <View3D
            width={480}
            height={320}
            cornerRadius={16}
            graphics3D={() => new Graphics3D()
                .perspective({ position: [0, 1.6, 5], lookAt: 0, fov: 45 })
                .ambient({ intensity: 0.35 })
                .directional({ intensity: 2.2, position: [3, 5, 4] })
                .box({
                    width: 2, height: 2, depth: 2,
                    color: '#e0533d', roughness: 0.4, metalness: 0.1,
                    rotation: [0, spin(), 0],
                })}
        />,
    );

    yield* spin(180, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
