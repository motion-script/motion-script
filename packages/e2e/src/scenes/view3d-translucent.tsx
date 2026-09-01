import {
    createScene, Mat,
    Canvas3D, Camera3D, AmbientLight3D, Plane3D, Box3D,
} from 'motion-script';
import { holdTail } from './_lib';

/**
 * Translucent 3D compositing, in a colour that can actually catch it going wrong.
 *
 * Correct alpha blending is `a·src + (1-a)·dst`; compositing a straight
 * (non-premultiplied) source as if it were premultiplied gives `src + (1-a)·dst`
 * instead. Those two are **identical on any channel where the source is zero**,
 * so a probe drawn in pure red, green or blue over black or white agrees to the
 * byte whichever one the pipeline is doing.
 *
 * That is exactly how the real bug survived: the 3D buffer reaches Skia
 * unpremultiplied (the browser divides alpha back out when a canvas is uploaded
 * as a texture source), and it was being declared premultiplied — so every
 * translucent surface composited additively and rendered at full strength, while
 * every opaque one was untouched because the two formulas agree at `a = 1`.
 * See `WebStorageAdapter.upload3DFrame`.
 *
 * So the tint here is deliberately non-degenerate on all three channels, and the
 * backdrop is a mid grey rather than black. Over `#1a1a1a` at 0.3, `#88ccff`
 * composites to `(59, 79, 95)` correctly and `(154, 222, 255)` additively —
 * a difference no pixel diff can miss.
 */
const TINT = '#88ccff';
const ALPHA = 0.3;

export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    stage.add(
        <Canvas3D width={480} height={320} fill="#1a1a1a">
            <Camera3D position={[0, 0, 7]} target={0} fov={45} />
            <AmbientLight3D intensity={1} />

            {/* Unlit, so the composite is the only thing under test. */}
            <Plane3D width={1.6} height={2.4} position={[-2.2, 0, 0]}
                material={Mat.basic({ color: TINT, opacity: ALPHA })} />

            {/* The same through the node props, which is what a scene writes —
                and the path where `transparent` is derived from the opacity. */}
            <Plane3D width={1.6} height={2.4} unlit fill={TINT} opacity={ALPHA} />

            {/* A back-faced, non-depth-writing shell: the shape a translucent
                enclosure takes, and where the additive composite was loudest. */}
            <Box3D width={1.6} height={2.4} depth={1.6} position={[2.2, 0, 0]}
                material={Mat.basic({
                    color: TINT, opacity: ALPHA, faces: 'back', depthWrite: false,
                })} />
        </Canvas3D>,
    );

    yield* holdTail(1);
});
