import {
    createScene, createSignal, easeInOut, linear, parallel, Geo, Mat,
    Canvas3D, PerspectiveCamera3D, Background3D, AmbientLight3D, DirectionalLight3D,
    Group3D, Mesh3D, Box3D, Line3D,
    Rect,
} from "motion-script";

const RANGE = 10;
const GRID = 70;

/** Soft-denominator "sombrero" wave — numerically stable at r=0. */
function sombrero(x: number, z: number, phase: number): number {
    const distance = Math.hypot(x, z);
    return Math.sin(distance - phase) / Math.sqrt(distance * distance + 1);
}

/** `h` in 0..1 around the hue wheel → a CSS colour string. */
function heightColor(normalized: number): string {
    const hue = (0.6 - normalized * 0.4) * 360;
    return `hsl(${hue} 100% 50%)`;
}

/**
 * The acceptance test for the 3D API: a 70×70 surface deformed per-vertex every
 * frame, with per-vertex colour, computed normals, a translucent back-face
 * bounding box and a wireframe edge overlay — all as plain descriptor data, with
 * no `three` import anywhere in this file.
 *
 * The travelling wave is driven by a `phase` **signal** tweened linearly across
 * the scene, not by the node's elapsed time. Two reasons: a prop is a reactive
 * binding, which re-evaluates when the signals it reads change and would never
 * see a clock tick; and a signal puts the motion on the timeline, so it scrubs and
 * exports frame-identically like everything else.
 *
 * `geometry` is a bound prop here rather than a fixed descriptor, which is the
 * expensive case on purpose: three's geometries are immutable, so a surface
 * deformed every frame reallocates every frame. That is the cost of a genuinely
 * per-vertex animation — a transform or a material value would be an in-place
 * write instead.
 */
export default createScene(function* (stage) {
    stage.set({ fill: "#05070c" });

    const amplitude = createSignal(2);
    const angle = createSignal(0);            // camera orbit, degrees
    const phase = createSignal(0);            // travelling-wave phase, radians

    /** Camera position on its orbit, at this frame's angle. */
    const orbit = (): [number, number, number] => {
        const radians = (angle() * Math.PI) / 180;
        return [Math.cos(radians) * 35, 18, Math.sin(radians) * 35];
    };

    stage.add(
        <Rect stroke={{ weight: 4, fill: 'red' }} clip={true} width={800} height={800}>
            <Canvas3D width="fill" height="fill">
                <PerspectiveCamera3D position={orbit} lookAt={0} fov={50} />
                <Background3D background="#1a1a1a" />
                <AmbientLight3D intensity={0.4} />
                <DirectionalLight3D intensity={1.5} position={[10, 20, 10]} />

                {/* The deformed surface. `vertex` is evaluated across the grid
                    each frame; `color` gives the per-vertex height gradient. */}
                <Mesh3D
                    geometry={() => {
                        const amp = amplitude();
                        const p = phase();
                        return Geo.parametric({
                            segments: [GRID, GRID],
                            vertex: (u, v) => {
                                const x = (u - 0.5) * 2 * RANGE;
                                const z = (v - 0.5) * 2 * RANGE;
                                return { x, y: sombrero(x, z, p) * amp, z };
                            },
                            color: (_u, _v, at) => heightColor((at.y / amp + 1) / 2),
                            computeNormals: true,
                        });
                    }}
                    material={Mat.phong({
                        side: "double",
                        vertexColors: true,
                        shininess: 80,
                        specular: "#444444",
                    })}
                />

                {/* Translucent shell + its wireframe edges. `side: "back"` and
                    `depthWrite: false` are what stop the shell from occluding
                    the surface inside it. */}
                <Group3D position={[0, 0, 0]}>
                    <Box3D
                        width={RANGE * 2} height={10} depth={RANGE * 2}
                        unlit
                        color="#88ccff"
                        opacity={0.05}
                        transparent
                        side="back"
                        depthWrite={false}
                    />
                    <Line3D
                        geometry={Geo.edges(
                            Geo.box({ width: RANGE * 2, height: 10, depth: RANGE * 2 }),
                        )}
                        mode="segments"
                        color="white"
                        opacity={0.4}
                    />
                </Group3D>
            </Canvas3D>
        </Rect>
    );

    // Phase runs linearly the whole way, so the ripples travel at a constant rate
    // regardless of what the camera and amplitude are doing.
    yield* parallel(
        phase(20, 4, linear()),
        angle(180, 4, easeInOut("quad")),
        amplitude(5, 2.5, easeInOut("quad")),
    );
    yield* parallel(
        phase(42.5, 4.5, linear()),
        angle(360, 4, easeInOut("quad")),
        amplitude(3, 3, easeInOut("quad")),
    );
});
