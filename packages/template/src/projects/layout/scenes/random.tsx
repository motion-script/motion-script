/** @jsxImportSource @motion-script/core/jsx */

import {
    createScene, createRef, Rect, Reference, easeInOut, parallel, sequence, wait,
} from "@motion-script/core";
import { layoutCard } from "./layout-card";

/**
 * The Motion-Script analogue of Motion Canvas's "random" example, rebuilt on the
 * `Random` API: `const random = stage.random(seed)` hands back a seeded source,
 * and every draw goes through it. A row of thin bars pulses its height in a
 * staggered wave, looped a few times — run here as **two** rows so the
 * distinction the API draws between its two families is visible side by side:
 *
 *  - **random row** — heights come from independent draws,
 *    `random.floatArray(COUNT, MIN, MAX)` (the `nextFloat` family). Adjacent
 *    bars are uncorrelated, so the row reads as jagged noise.
 *  - **noise row** — heights come from `random.noise(i / COUNT, freq)` sampled
 *    along the bar index. `noise` is a *correlated field*: neighbours stay
 *    close, so the heights flow as a continuous wave across the row.
 *
 * The two are NOT interchangeable — `gauss` (used here for bar widths) is still
 * an independent draw, just bell-shaped instead of flat; only `noise` gives
 * smoothness across an input. Bar colours use `intArray` (discrete index
 * picks). `random.reset()` rewinds the source between loops so every pass draws
 * the identical heights — the determinism guarantee, made visible as the wave
 * repeating exactly.
 */

/** Bars per row. */
const COUNT = 40;
/** Times the staggered wave repeats. */
const LOOPS = 3;
/** Stagger between adjacent bars kicking off, in seconds. */
const STAGGER = 0.04;
/** Up/down duration of a single bar pulse, in seconds. */
const PULSE = 0.5;
/** Resting bar height; bars pulse up from here and settle back. */
const BASE_HEIGHT = 10;
/** Pulse height range (matches MC's `random.nextInt(100, 200)`). */
const MIN_PULSE = 100;
const MAX_PULSE = 200;
/** Bar width: gauss-distributed around this mean so widths vary naturally. */
const WIDTH_MEAN = 12;
const WIDTH_STDEV = 3;

const PALETTE = ["#E8617C", "#6990DD", "#F5C26B"];

export default createScene(function* (stage) {
    // Two seeded sources. The seed lives on each source (not the stage), so the
    // streams are independent and each is reproducible on its own:
    //  - `layout`: drawn once for the static per-bar widths/colours.
    //  - `wave`:   re-drawn every loop; `reset()` rewinds JUST these height draws
    //              so each loop reproduces the identical wave.
    const layout = stage.random("layout-random");
    const waveRandom = stage.random("layout-random-wave");
    stage.set({ fill: "bg" });

    const randomBars = Array.from({ length: COUNT }, () => createRef<Rect>());
    const noiseBars = Array.from({ length: COUNT }, () => createRef<Rect>());

    // Per-bar widths: independent gauss draws (bell curve), clamped to stay
    // positive — clustered near WIDTH_MEAN with occasional thinner/fatter bars.
    const widths = Array.from({ length: COUNT }, () =>
        Math.max(4, layout.gauss(WIDTH_MEAN, WIDTH_STDEV)),
    );
    // Per-bar colour indices: discrete integer picks across the palette.
    const colorIdx = layout.intArray(COUNT, 0, PALETTE.length);

    // A single bar: a thin rounded column with a gauss width and palette colour.
    const bar = (ref: Reference<Rect>, i: number) => (
        <Rect ref={ref} width={widths[i]} height={BASE_HEIGHT} cornerRadius={5} fill={PALETTE[colorIdx[i]]} />
    );

    // A row of bars, end-aligned (bottomCenter) so they stand on a baseline.
    const barRow = (refs: Reference<Rect>[]) => (
        <Rect width={"fill"} height={"fill"} group={"row"} gap={10} align={"bottomCenter"}>
            {refs.map((ref, i) => bar(ref, i))}
        </Rect>
    );

    stage.add(
        layoutCard({
            label: "Random vs noise (seeded bar waves)",
            stage: "column",
            gap: 48,
            children: (
                <Rect width={"fill"} height={"fill"} group={"column"} gap={48}>
                    {barRow(randomBars)}
                    {barRow(noiseBars)}
                </Rect>
            ),
        }),
    );

    // One bar's pulse: grow to `height`, then settle back to BASE — mirroring
    // MC's `rect.size.y(h, .5).to(10, .5)`.
    const pulse = (ref: Reference<Rect>, height: number) =>
        ref().to({ height }, PULSE, easeInOut("quad")).to({ height: BASE_HEIGHT }, PULSE, easeInOut("quad"));

    // A staggered wave across one row: bar `i` kicks off `i * STAGGER` after the
    // first, so the pulse ripples left-to-right (MC's `sequence(0.04, …)`).
    const wave = (refs: Reference<Rect>[], heights: number[]) =>
        parallel(
            ...refs.map((ref, i) => sequence(wait(i * STAGGER), pulse(ref, heights[i]))),
        );

    for (let l = 0; l < LOOPS; l++) {
        // Rewind the wave source so each loop draws the SAME heights — the
        // reproducibility guarantee, visible as the wave repeating exactly. It's
        // a dedicated source, so reset() realigns exactly the height draws below
        // without having to account for the layout source's width/colour draws.
        waveRandom.reset();

        // random row: independent draws — a flat array of uncorrelated heights.
        const randomHeights = waveRandom.floatArray(COUNT, MIN_PULSE, MAX_PULSE);
        // noise row: a smooth field sampled along the bar index. `noise` is pure
        // in its input (it doesn't consume the draw stream), so it doesn't
        // disturb the independent draws above.
        const noiseHeights = Array.from({ length: COUNT }, (_, i) =>
            MIN_PULSE + waveRandom.noise(i / COUNT, 6) * (MAX_PULSE - MIN_PULSE),
        );

        yield* parallel(
            wave(randomBars, randomHeights),
            wave(noiseBars, noiseHeights),
        );
    }

    yield* wait(0.4);
});
