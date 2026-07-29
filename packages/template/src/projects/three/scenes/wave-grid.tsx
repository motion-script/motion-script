import {
    createScene, createSignal, easeInOut, linear, parallel, Geo, Mat, View3D, Graphics3D,
    Effects,
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
 * the scene, not by the node's elapsed time. Two reasons: the builder is a
 * reactive binding, which re-evaluates when the signals it reads change and would
 * never see a clock tick; and a signal puts the motion on the timeline, so it
 * scrubs and exports frame-identically like everything else.
 */
export default createScene(function* (stage) {
    stage.set({ fill: "#05070c" });

    const amplitude = createSignal(2);
    const angle = createSignal(0);            // camera orbit, degrees
    const phase = createSignal(0);            // travelling-wave phase, radians

    stage.add(
        <Rect stroke={{ weight: 4, fill: 'red' }} clip={true} width={800} height={800}>


            <View3D
                width="fill"
                height="fill"

                graphics3D={() => {
                    const amp = amplitude();
                    const a = angle();
                    const p = phase();
                    const radians = (a * Math.PI) / 180;

                    return new Graphics3D()
                        .perspective({
                            position: [Math.cos(radians) * 35, 18, Math.sin(radians) * 35],
                            lookAt: 0,
                            fov: 50,
                        })
                        .background("#1a1a1a")
                        .ambient({ intensity: 0.4 })
                        .directional({ intensity: 1.5, position: [10, 20, 10] })

                        // The deformed surface. `vertex` is evaluated across the grid
                        // each frame; `color` gives the per-vertex height gradient.
                        .mesh(
                            Geo.parametric({
                                segments: [GRID, GRID],
                                vertex: (u, v) => {
                                    const x = (u - 0.5) * 2 * RANGE;
                                    const z = (v - 0.5) * 2 * RANGE;
                                    return { x, y: sombrero(x, z, p) * amp, z };
                                },
                                color: (_u, _v, p) => heightColor((p.y / amp + 1) / 2),
                                computeNormals: true,
                            }),
                            Mat.phong({
                                side: "double",
                                vertexColors: true,
                                shininess: 80,
                                specular: "#444444",
                            }),
                        )

                        // Translucent shell + its wireframe edges. `side: "back"` and
                        // `depthWrite: false` are what stop the shell from occluding
                        // the surface inside it.
                        .group({ position: [0, 0, 0] }, (inner) => inner
                            .box({
                                width: RANGE * 2, height: 10, depth: RANGE * 2,
                                unlit: true,
                                color: "#88ccff",
                                opacity: 0.05,
                                transparent: true,
                                side: "back",
                                depthWrite: false,
                            })
                            .line({
                                geometry: Geo.edges(
                                    Geo.box({ width: RANGE * 2, height: 10, depth: RANGE * 2 }),
                                ),
                                mode: "segments",
                                color: "white",
                                opacity: 0.4,
                            }),
                        );
                }}
            />
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
