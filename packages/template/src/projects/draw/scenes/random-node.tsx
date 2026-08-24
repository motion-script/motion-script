import {
    createScene, createRef, Rect, Text, easeInOut, sequence,
} from "motion-script";
import { RandomSwatch } from "../nodes/random-swatch";

/**
 * Manual check for `stage.random(seed)` — the project's one source of
 * randomness. A custom node paints itself from a source the scene hands it;
 * {@link RandomSwatch} does exactly that in its constructor.
 *
 * What to look for:
 *  - **Left column** — every swatch is handed the *same* source, so they paint
 *    identically (same colour + corner radius).
 *  - **Right grid** — each swatch gets a source seeded by its index, so every
 *    cell differs, yet is reproducible: scrub the timeline back and forth (or
 *    hot-reload) and the grid stays pixel-identical, because the stage rewinds
 *    every source before each replay.
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

    // Seeded grid: each cell gets its own source (keyed by flat index), so the
    // whole grid is varied but fully deterministic.
    const seededGrid = (
        <Rect flow={"vertical"} gap={16} align={"center"}>
            {Array.from({ length: ROWS }, (_, r) => (
                <Rect flow={"horizontal"} gap={16}>
                    {Array.from({ length: COLS }, (_, c) => (
                        <RandomSwatch random={stage.random(r * COLS + c)} width={CELL} height={CELL} />
                    ))}
                </Rect>
            ))}
        </Rect>
    );

    // One shared source for the whole column → every swatch draws the same.
    const unseededColumn = (
        <Rect ref={driftRef} flow={"vertical"} gap={16} align={"center"}>
            {Array.from({ length: ROWS }, () => (
                <RandomSwatch random={stage.random("column")} width={CELL} height={CELL} />
            ))}
        </Rect>
    );

    stage.add(
        <Rect width={"fill"} height={"fill"} flow={"vertical"} padding={80} gap={32}>
            <Text fontFamily={"Pixelify Sans"} text={"stage.random — seeded draws, handed to a node"} fontSize={72} fill={"gray"} />
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
