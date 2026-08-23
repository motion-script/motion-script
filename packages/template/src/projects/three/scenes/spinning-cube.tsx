import {
    createScene, createSignal, easeInOut, easeOut, parallel, wait,
    lerpVector3, Canvas3D, PerspectiveCamera3D, DirectionalLight3D, Box3D,
    type Vector3,
} from "motion-script";

/**
 * The basic 3D scene: a lit cube, animated entirely from timeline signals.
 *
 * Note what makes this seekable — every prop below is a reactive binding read at
 * the current frame's value, so nothing accumulates and scrubbing backwards lands
 * on exactly the same pixels as playing forwards.
 *
 * Note also `createSignal(..., lerpVector3)` on `lift`: a signal holding a
 * non-number needs an explicit lerp or it will snap at the end of the tween
 * instead of interpolating. Numbers (`spin`, `rough`) get that for free.
 */
export default createScene(function* (stage) {
    stage.set({ fill: "#05070c" });

    const spin = createSignal(0);                                   // degrees
    const lift = createSignal<Vector3>({ x: 0, y: 0, z: 0 }, lerpVector3);
    const rough = createSignal(0.9);

    stage.add(
        <Canvas3D
            width={1600}
            height={900}
            cornerRadius={32}
            shadow={{ blur: 30, fill: 'red', offset: { x: 200, y: 200 } }}
        >
            {/* Track the cube as it rises, rather than staring at the origin —
                otherwise the lift carries it out of frame. */}
            <PerspectiveCamera3D position={[0, 2.5, 6]} lookAt={() => lift()} fov={45} />
            <DirectionalLight3D intensity={2.4} position={[4, 6, 3]} />
            <Box3D
                width={2} height={2} depth={2}
                color="#e0533d" roughness={() => rough()} metalness={0.1}
                position={() => lift()}
                rotation={() => [0, spin(), 0]}
            />
        </Canvas3D>,
    );

    yield* parallel(
        spin(720, 3, easeInOut("quad")),
        lift({ x: 0, y: 1.5, z: 0 }, 1.5, easeOut("quad")),
        rough(0.1, 3),
    );
    yield* wait(0.3);
});
