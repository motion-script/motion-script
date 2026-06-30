import { createScene, createRef, Text, wait, parallel, easeOut, easeInOut } from "motion-script";

const BG = '#0D0F15';
const CREAM = '#F5ECD7';
const COPPER = '#C07840';
const BLUE = '#6990DD';

/**
 * Exercises the Text selection API: each selector targets a sub-range and
 * animates it independently (opacity, transform, fill, fontWeight/letterSpacing
 * reshaping), plus two overlapping selections animated in parallel.
 */
export default createScene(function* (stage) {
        stage.set({ fill: BG, group: 'column', gap: 60, padding: 80 });

        const find = createRef<Text>();
        const word = createRef<Text>();
        const regex = createRef<Text>();
        const weight = createRef<Text>();
        const overlap = createRef<Text>();

        const line = (ref: any, text: string) => (
            <Text ref={ref} text={text} fontSize={64} fontWeight={500} fill={CREAM} textAlign={'center'} />
        );

        stage.add(line(find, 'select pieces of text'));
        stage.add(line(word, 'animate any word'));
        stage.add(line(regex, 'fade 123 numbers 456'));
        stage.add(line(weight, 'embolden the middle'));
        stage.add(line(overlap, 'overlapping selections'));

        yield* wait(0.4);

        // find(): fade + lift a substring; word(): recolor one word.
        yield* parallel(
            find().find('pieces of text').to({ opacity: 0.3, y: -14, fill: COPPER }, 1.2, easeOut('quad')),
            word().word(1).to({ fill: BLUE, scale: 1.3 }, 1.2, easeOut('quad')),
        );

        // match(): fade every numeric run via regex.
        yield* regex().match(/\d+/).to({ opacity: 0.15 }, 1, easeInOut('quad'));

        // fontWeight reshaping on a slice.
        yield* weight().find('the middle').to({ fontWeight: 900, fill: COPPER, rotation: 30 }, 1.2, easeInOut('quad'));

        // Two overlapping selections animated together: opacity multiplies on
        // the shared glyphs, the later selection wins the transform.
        const a = overlap().find('overlapping');
        const b = overlap().find('ping selections');
        yield* parallel(
            a.to({ opacity: 0.5, y: -10, fill: BLUE }, 1.2),
            b.to({ opacity: 0.5, y: 10, fill: COPPER }, 1.2),
        );

        yield* wait(1);
});
