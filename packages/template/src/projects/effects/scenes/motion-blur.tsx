

import { createScene, createRef, Node2D, Reference, Effects as FX, easeInOut, easeIn, parallel } from "motion-script";
import { STAGE, SAMPLES, TRAVELLING_SAMPLE, sampleGrid, sampleRow } from "../../../shared/effect-demo";

const LABEL = 'Motion blur';

/** Sweep endpoints, as an x offset from the centre of the cell. */
const LEFT = -100;
const RIGHT = 100;
/** Seconds to cross the full LEFT→RIGHT span; shorter hops scale down, so speed is constant. */
const SWEEP = 0.5;

/**
 * Motion blur is velocity-driven, so unlike every other effect it can't be shown
 * as a static from → to: a sample sitting still renders sharp no matter how the
 * effect is configured. This scene keeps the same grid as the rest of the showcase
 * but sweeps both rows across their cells in lock-step — the top row un-blurred,
 * the bottom row carrying `motionBlur` — so only the bottom one smears.
 *
 * `strength` compensates for the short travel inside a grid cell: the smear is
 * `velocity × dt × (length / 100) × strength`, so a 3× multiplier buys a legible
 * streak without needing a full-width lane.
 *
 * The last sweep eases *in*, accelerating into the final frame. At rest the effect
 * is invisible, so ending at peak velocity is what makes the closing frame (what
 * `ms screenshot last` captures) show the effect at all.
 */
export default createScene(function* (stage) {
    stage.set({ fill: STAGE });

    const sharp: Reference<any>[] = SAMPLES.map(() => createRef<Node2D>());
    const blurred: Reference<any>[] = SAMPLES.map(() => createRef<Node2D>());

    stage.add(sampleGrid(LABEL, [
        sampleRow(`Without ${LABEL}`, { style: TRAVELLING_SAMPLE, refs: sharp }),
        sampleRow(`With ${LABEL}`, {
            style: TRAVELLING_SAMPLE,
            refs: blurred,
            effects: FX.motionBlur({ length: 100, strength: 1.5, alignment: 'centered', samples: 16 }),
        }),
    ]));

    // `moveX` takes an absolute x, so track where the samples are to keep every
    // hop at the same speed regardless of how far it travels.
    let at = 0;
    const sweepTo = (x: number, ease = easeInOut('quad')) => {
        const duration = SWEEP * Math.abs(x - at) / (RIGHT - LEFT);
        at = x;
        return parallel(...[...sharp, ...blurred].map(ref => ref().to({ x }, duration, ease)));
    };

    // Out from centre, two round trips, then accelerate away so the closing frame
    // is the fastest one rather than a dead stop.
    yield* sweepTo(RIGHT);
    for (let i = 0; i < 2; i++) {
        yield* sweepTo(LEFT);
        yield* sweepTo(RIGHT);
    }
    yield* sweepTo(LEFT, easeIn('quad'));
});
