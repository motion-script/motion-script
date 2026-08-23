import {
    createScene, createRef, Rect, Text, easeInOut, sequence,
} from "motion-script";
import { RandomSwatch } from "../nodes/random-swatch";

/**
 * Manual check for per-node `this.random` — every `Node2D` now carries its own
 * seeded `Random`, so a custom node can paint itself from randomness without a
 * `Random` threaded in from the stage. {@link RandomSwatch} does exactly that in
 * its `init()`.
 *
 * What to look for:
 *  - **Left column** — swatches with NO seed prop. They all share the default
 *    seed (`0`), so they paint *identically* (same colour + corner radius).
 *  - **Right grid** — each swatch is seeded by its index, so every cell differs,
 *    yet is reproducible: scrub the timeline back and forth (or hot-reload) and
 *    the grid stays pixel-identical, because base `init()` rewinds each source
 *    every pass.
 *
 * A slow drift animates one column so there's something to scrub against while
 * confirming the randomised look never changes between passes.
 */

const COLS = 6;
const ROWS = 4;
const CELL = 120;

export default createScene(function* (stage) {
    stage.set({ fill: "bg" });

    const driftRef = createRef<Rect>();

    // Seeded grid: each cell gets a distinct seed (its flat index), so the whole
    // grid is varied but fully deterministic.
    const seededGrid = (
        <Rect flow={"vertical"} gap={16} align={"center"}>
            {Array.from({ length: ROWS }, (_, r) => (
                <Rect flow={"horizontal"} gap={16}>
                    {Array.from({ length: COLS }, (_, c) => (
                        <RandomSwatch seed={r * COLS + c} width={CELL} height={CELL} />
                    ))}
                </Rect>
            ))}
        </Rect>
    );

    // Unseeded column: no seed prop → all share the default seed 0 → identical.
    const unseededColumn = (
        <Rect ref={driftRef} flow={"vertical"} gap={16} align={"center"}>
            {Array.from({ length: ROWS }, () => (
                <RandomSwatch width={CELL} height={CELL} />
            ))}
        </Rect>
    );

    stage.add(
        <Rect width={"fill"} height={"fill"} flow={"vertical"} padding={80} gap={32}>
            <Text fontFamily={"Pixelify Sans"} text={"Node2D.random — per-node seeded draws"} fontSize={72} fill={"gray"} />
            <Rect width={"fill"} height={"fill"} flow={"horizontal"} gap={64} align={"center"}>
                {unseededColumn}
                {seededGrid}
            </Rect>
        </Rect>,
    );

    // Drift the unseeded column up and back so there's motion to scrub against —
    // the swatches' randomised look must stay identical across the whole replay.
    yield* sequence(
        driftRef().to({ y: -60 }, 2, easeInOut("quad")),
        driftRef().to({ y: 60 }, 3, easeInOut("quad")),
        driftRef().to({ y: 0 }, 2, easeInOut("quad")),
    );
});
