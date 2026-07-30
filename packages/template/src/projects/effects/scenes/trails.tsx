import { createScene, createRef, Node, Reference, Effects as FX, easeInOut, easeIn, parallel } from "motion-script";
import { STAGE, SAMPLES, TRAVELLING_SAMPLE, sampleGrid, sampleRow } from "../../../shared/effect-demo";

const LABEL = 'Trails';

/** Sweep endpoints, as an x offset from the centre of the cell. */
const LEFT = -100;
const RIGHT = 100;
/** Seconds to cross the full LEFT→RIGHT span; shorter hops scale down, so speed is constant. */
const SWEEP = 0.6;

/**
 * Like `motion-blur`, trails cannot be shown as a static from → to: the effect is
 * built from where the node *was*, so a sample sitting still stacks its whole
 * history in one place and merely brightens. Both rows sweep in lock-step and
 * only the bottom one carries the effect.
 *
 * It differs from motion blur in what it proves. Motion blur smears within a
 * single frame's shutter; this keeps discrete, separated copies at `delay`
 * intervals, so the closing frame shows a row of ghosts rather than one streak.
 *
 * The last sweep eases *in* for the same reason motion blur's does — the trail is
 * longest at speed, so ending at peak velocity is what makes the frame
 * `ms screenshot last` captures show the effect at its clearest.
 */
export default createScene(function* (stage) {
    stage.set({ fill: STAGE });

    const plain: Reference<any>[] = SAMPLES.map(() => createRef<Node>());
    const trailed: Reference<any>[] = SAMPLES.map(() => createRef<Node>());

    stage.add(sampleGrid(LABEL, [
        sampleRow(`Without ${LABEL}`, { style: TRAVELLING_SAMPLE, refs: plain }),
        sampleRow(`With ${LABEL}`, {
            style: TRAVELLING_SAMPLE,
            refs: trailed,
            effects: FX.trails({ echoes: 8, delay: 1 / 30, decay: 0.78 }),
        }),
    ]));

    let at = 0;
    const sweepTo = (x: number, ease = easeInOut('quad')) => {
        const duration = SWEEP * Math.abs(x - at) / (RIGHT - LEFT);
        at = x;
        return parallel(...[...plain, ...trailed].map(ref => ref().moveX(x, duration, ease)));
    };

    yield* sweepTo(RIGHT);
    for (let i = 0; i < 2; i++) {
        yield* sweepTo(LEFT);
        yield* sweepTo(RIGHT);
    }
    yield* sweepTo(LEFT, easeIn('quad'));
});
