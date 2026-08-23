import {
    createScene, createSignal, easeInOut, Graphics2D, Tex,
    Canvas3D, PerspectiveCamera3D, AmbientLight3D, DirectionalLight3D, Plane3D,
} from 'motion-script';
import { holdTail } from './_lib';

/**
 * 2D-on-3D: a `Tex.surface` bound to a material map.
 *
 * The other direction of the bridge, and the one with the most machinery behind
 * it — the 2D source is rasterized to an offscreen buffer during preflight, read
 * back, and uploaded as a texture before the 3D scene syncs, so that a scrubbed
 * frame carries the same pixels a played one would.
 *
 * The source is hoisted out of the scene on purpose. Rebuilding it per frame
 * would re-lay-out every frame, defeat the texture cache and leak — a mistake
 * worth having a regression test sit on.
 */
const panel = new Graphics2D()
    .rect({ width: 512, height: 512 })
    .fill('#101826')
    .rect({ x: 64, y: 64, width: 384, height: 160 })
    .fill('#4f8ef7')
    .rect({ x: 64, y: 288, width: 384, height: 160 })
    .fill('#e0533d');

export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const spin = createSignal(-25);

    stage.add(
        <Canvas3D width={480} height={320}>
            <PerspectiveCamera3D position={[0, 0, 4.2]} lookAt={0} fov={45} />
            <AmbientLight3D intensity={0.8} />
            <DirectionalLight3D intensity={1.6} position={[2, 3, 4]} />
            <Plane3D
                width={3} height={3}
                map={Tex.surface(panel, 512, 512)}
                rotation={() => [0, spin(), 0]}
            />
        </Canvas3D>,
    );

    yield* spin(25, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
