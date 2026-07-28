import { createScene, createSignal, easeInOut, Effects, parallel, wait } from "motion-script";
import { Graph3D, type Formula } from "../../../components/graph3d";

/** The reference palette, so each surface reads distinctly against the others. */
const PALETTE = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

/**
 * The {@link Graph3D} node: `z = f(x, y)` surfaces with a helper grid and axes.
 *
 * Expressions arrive as plain props — there is no interactive sidebar, and no
 * OrbitControls, because a rendered timeline has no pointer. The camera is driven
 * instead by `orbit`/`elevation` signals, which keeps every frame reproducible
 * under scrubbing and export.
 *
 * The formula list is a signal too, so surfaces can be introduced mid-scene.
 * Each surface is keyed by its `id` inside the node, so adding one doesn't
 * disturb the meshes already on screen.
 */
export default createScene(function* (stage) {
    stage.set({ fill: "#111827" });

    const orbit = createSignal(20);       // degrees around Y
    const elevation = createSignal(30);   // degrees above the ground plane
    // Distance from the origin. The domain spans 20 units, and a 45° fov shows
    // roughly `0.83 × distance` of height — so ~45 frames the whole surface with
    // a little air around it.
    const zoom = createSignal(46);

    const ripple: Formula = {
        id: "ripple",
        expression: "sin(sqrt(x^2 + y^2))",
        color: PALETTE[0],
    };
    const saddle: Formula = {
        id: "saddle",
        expression: "(x^2 - y^2) / 12",
        color: PALETTE[1],
        opacity: 0.75,
    };
    const waves: Formula = {
        id: "waves",
        expression: "sin(x / 2) * cos(y / 2) * 2",
        color: PALETTE[2],
        opacity: 0.7,
    };

    const formulas = createSignal<Formula[]>([ripple]);

    stage.add(
        <Graph3D
            width="fill"
            height="fill"
            formulas={() => formulas()}
            orbit={() => orbit()}
            elevation={() => elevation()}
            zoom={() => zoom()}
            camera={{ minZoom: 12, maxZoom: 80 }}
            grid={{
                size: 20,
                divisions: 20,
                colorCenterLine: "#4B5563",
                colorGrid: "#1F2937",
                axesSize: 10,
            }}
        />,
    );

    // Establish the first surface, then bring the others in on top of it.
    yield* parallel(
        orbit(120, 4, easeInOut("quad")),
        zoom(38, 2, easeInOut("quad")),
    );

    formulas([ripple, saddle]);
    yield* parallel(
        orbit(240, 4, easeInOut("quad")),
        elevation(55, 2.5, easeInOut("quad")),
    );

    formulas([ripple, saddle, waves]);
    yield* parallel(
        orbit(380, 4, easeInOut("quad")),
        elevation(22, 2.5, easeInOut("quad")),
        zoom(50, 3, easeInOut("quad")),
    );

    // Hiding a formula removes its mesh but leaves the others' cached geometry
    // untouched, because each surface is keyed by id rather than list position.
    formulas([ripple, { ...saddle, visible: false }, waves]);
    yield* wait(0.8);
});
