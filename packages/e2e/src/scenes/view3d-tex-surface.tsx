import {
    createSignal, easeInOut, Graphics2D, Tex,
    Canvas3D, Camera3D, AmbientLight3D, DirectionalLight3D, Plane3D } from 'motion-script';
import { scene } from './_chain';
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

const spin = createSignal(-25);
export default scene((stage) => {
    // Re-seeded here, not just at construction: these signals outlive a build,
    // and a scene is built more than once per render. A tween snapshots its
    // `from` the first time it is evaluated, so without this the second build
    // would start from where the first one ended and animate nothing.
    spin.set(-25);
    stage.set({ fill: 'bg' });

    stage.add(
        <Canvas3D width={480} height={320}>
            <Camera3D position={[0, 0, 4.2]} target={0} fov={45} />
            <AmbientLight3D intensity={0.8} />
            <DirectionalLight3D intensity={1.6} position={[2, 3, 4]} />
            <Plane3D
                width={3} height={3}
                fill={Tex.surface(panel, { width: 512, height: 512 })}
                rotation={() => [0, spin(), 0]}
            />
        </Canvas3D>,
    );
}, [
    () => spin(25, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
