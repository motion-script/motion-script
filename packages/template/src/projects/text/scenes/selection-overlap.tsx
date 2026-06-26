/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Text, wait, parallel, sequence, easeOut, easeInOut } from "@motion-script/core";

const BG = '#0D0F15';
const CREAM = '#F5ECD7';
const COPPER = '#C07840';
const BLUE = '#6990DD';

/**
 * Selections are created in order and layer on the same node: numeric fields
 * (transform/font) use last-created-wins on overlapping glyphs, but `opacity`
 * multiplies across every selection covering a piece. Also covers `words()`
 * (select every whitespace-delimited word at once) staggered individually.
 */
export default createScene(function* (stage) {
    stage.set({ fill: BG, group: 'column', gap: 60, padding: 80 });

    const overlap = createRef<Text>();
    const stagger = createRef<Text>();

    stage.add(<Text ref={overlap} text={'overlapping selections stack'} fontSize={56} fontWeight={600} fill={CREAM} textAlign={'start'} width={'fill'} />);
    stage.add(<Text ref={stagger} text={'every word lifts in turn'} fontSize={56} fontWeight={600} fill={CREAM} textAlign={'start'} width={'fill'} />);

    yield* wait(0.4);

    // Two selections share "selections" — its opacity gets multiplied by both
    // (0.6 * 0.6 = 0.36, visibly darker than either selection alone), while the
    // y/fill transform comes from `b`, the later-created selection.
    const a = overlap().find('overlapping selections');
    const b = overlap().find('selections stack');
    yield* parallel(
        a.to({ opacity: 0.6, y: -12, fill: BLUE }, 1.2, easeOut('quad')),
        b.to({ opacity: 0.6, y: 10, fill: COPPER }, 1.2, easeOut('quad')),
    );

    yield* wait(0.6);

    yield* parallel(
        a.to({ opacity: 1, y: 0 }, 1, easeInOut('quad')),
        b.to({ opacity: 1, y: 0 }, 1, easeInOut('quad')),
    );

    yield* wait(0.3);

    // words() returns every word as one selection covering disjoint ranges, so
    // a single .to() lifts them all together...
    yield* stagger().words().to({ y: -16, fill: BLUE }, 0.6, easeOut('quad'));
    yield* wait(0.2);
    yield* stagger().words().to({ y: 0, fill: CREAM }, 0.6, easeOut('quad'));

    yield* wait(0.3);

    // ...while indexing word(n) one at a time gives a manual per-word stagger.
    const words = stagger().text.split(' ').map((_, i) => stagger().word(i));
    yield* sequence(
        ...words.map(w => w.to({ y: -16, fill: COPPER }, 0.35, easeOut('quad'))),
    );

    yield* wait(1);
});
