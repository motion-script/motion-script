

import { createScene, createRef, Text, wait, parallel, easeOut } from "motion-script";

const BG = '#0D0F15';
const CREAM = '#F5ECD7';
const COPPER = '#C07840';
const BLUE = '#6990DD';

/**
 * One selector per line: `find()` a substring, `word(n)` by index, `match()`
 * a regex, `line(n)` of a multi-line node, `slice()` a raw character range,
 * and `filter()` a predicate over individual characters (here, vowels) — each
 * animated independently to show the selector picked the intended glyphs.
 */
export default createScene(function* (stage) {
    stage.set({ fill: BG, group: 'column', gap: 44, padding: 80 });

    const find = createRef<Text>();
    const word = createRef<Text>();
    const match = createRef<Text>();
    const lineSel = createRef<Text>();
    const slice = createRef<Text>();
    const filter = createRef<Text>();

    const row = (ref: any, text: string) => (
        <Text ref={ref} text={text} fontSize={48} fontWeight={500} fill={CREAM} textAlign={'start'} width={'fill'} />
    );

    stage.add(row(find, 'find(): select pieces of text'));
    stage.add(row(word, 'word(2): index into whitespace-split words'));
    stage.add(row(match, 'match(/[0-9]+/): every run of 123 and 456'));
    stage.add(row(lineSel, 'line(1) of a node\nspanning two lines'));
    stage.add(row(slice, 'slice(0, 5): a raw character range'));
    stage.add(row(filter, 'filter(): every vowel in this sentence'));

    yield* wait(0.4);

    yield* parallel(
        find().find('pieces of text').to({ fill: COPPER, y: -10 }, 1, easeOut('quad')),
        word().word(2).to({ fill: BLUE, scale: 1.3 }, 1, easeOut('quad')),
        match().match(/[0-9]+/).to({ opacity: 0.2 }, 1, easeOut('quad')),
        lineSel().line(1).to({ fill: COPPER, x: 16 }, 1, easeOut('quad')),
        slice().slice(0, 5).to({ fill: BLUE, rotation: -6 }, 1, easeOut('quad')),
        filter().filter(c => 'aeiouAEIOU'.includes(c)).to({ fill: COPPER, scale: 1.2 }, 1, easeOut('quad')),
    );

    yield* wait(1);
});
