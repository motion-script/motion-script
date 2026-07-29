import { createRef, createScene, easeInOut, wait } from "motion-script";
import { Graph3D, type Formula, type GridControls } from "../nodes/graph3d";

/** The reference palette, so each surface reads distinctly against the others. */
const PALETTE = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

const GRID: GridControls = {
    size: 20,
    divisions: 20,
    colorCenterLine: "#4B5563",
    colorGrid: "#1F2937",
    axesSize: 10,
};

/**
 * The {@link Graph3D} node: `z = f(x, y)` surfaces with a helper grid and axes.
 *
 * Expressions arrive as plain props — there is no interactive sidebar, and no
 * OrbitControls, because a rendered timeline has no pointer. The camera is driven
 * instead by the node's own `orbit`/`elevation`/`zoom` props, which keeps every
 * frame reproducible under scrubbing and export.
 *
 * Everything here is one `to()` per beat, because every prop on the node is a
 * `@property` with a mapper and a tween. `formulas` is the interesting one: its
 * tween matches the two lists by `id`, so a surface that appears fades in, one
 * that disappears fades out, and one that stays but changes its *expression*
 * morphs — its sampled height blends from the old function to the new.
 */
export default createScene(function* (stage) {
    stage.set({ fill: "#111827" });

    const graph = createRef<Graph3D>();

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
    /** Same `id` as {@link ripple}, tighter rings — so it morphs rather than swaps. */
    const rippleTight: Formula = {
        ...ripple,
        expression: "sin(sqrt(x^2 + y^2) * 2) * 1.5",
    };

    stage.add(
        <Graph3D
            ref={graph}
            width="fill"
            height="fill"
            formulas={[ripple]}
            // Distance from the origin. The domain spans 20 units, and a 45° fov
            // shows roughly `0.83 × distance` of height — so ~45 frames the whole
            // surface with a little air around it.
            orbit={20}
            elevation={30}
            zoom={46}
            camera={{ minZoom: 12, maxZoom: 80 }}
            grid={GRID}
        />,
    );

    // Establish the first surface.
    yield* graph().to({ orbit: 120, zoom: 38 }, 4, easeInOut("quad"));

    // `saddle` is new to the list, so it fades in while the camera keeps moving —
    // `ripple` is matched by id and left alone.
    yield* graph().to(
        { formulas: [ripple, saddle], orbit: 240, elevation: 55 },
        4,
        easeInOut("quad"),
    );

    // `waves` fades in and `ripple` morphs into `rippleTight` at the same time,
    // because they share an id and only the expression differs.
    yield* graph().to(
        { formulas: [rippleTight, saddle, waves], orbit: 380, elevation: 22, zoom: 50 },
        4,
        easeInOut("quad"),
    );

    // Hiding a formula fades its mesh out and leaves the others' cached geometry
    // untouched, because each surface is keyed by id rather than list position.
    yield* graph().to(
        { formulas: [rippleTight, { ...saddle, visible: false }, waves] },
        1.2,
        easeInOut("quad"),
    );

    yield* wait(0.8);
});
