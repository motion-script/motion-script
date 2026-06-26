/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Text, wait, parallel, easeInOut } from "@motion-script/core";
import { textCard, textCell } from "./text-card";

const CREAM = '#F5ECD7';
const BLUE = '#6990DD';
const COPPER = '#C07840';

/**
 * Animates the four properties that shape a {@link Text} node's glyph
 * metrics: `fontWeight` along a variable font's weight axis, `fontStyle`
 * toggling normal/italic, `letterSpacing` tracking the glyphs apart, and
 * `lineHeight` opening up the gap between wrapped lines.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const weight = createRef<Text>();
    const style = createRef<Text>();
    const tracking = createRef<Text>();
    const leading = createRef<Text>();

    stage.add(textCard({
        label: 'Font Styling',
        stage: 'row',
        gap: 32,
        children: (
            <>
                {textCell({ caption: 'fontWeight', children: <Text ref={weight} text={'Weight'} fontSize={56} fontWeight={100} fill={CREAM} /> })}
                {textCell({ caption: 'fontStyle', children: <Text ref={style} text={'Italic'} fontSize={56} fontWeight={600} fontStyle={'normal'} fill={BLUE} /> })}
                {textCell({ caption: 'letterSpacing', children: <Text ref={tracking} text={'SPACED'} fontSize={48} fontWeight={700} letterSpacing={0} fill={COPPER} /> })}
                {textCell({
                    caption: 'lineHeight',
                    children: (
                        <Text
                            ref={leading}
                            text={'two lines\nof text'}
                            fontSize={40}
                            fontWeight={500}
                            lineHeight={1}
                            textAlign={'center'}
                            fill={CREAM}
                        />
                    ),
                })}
            </>
        ),
    }));

    yield* wait(0.3);

    // fontStyle is a plain enum, not a tweenable number — flip it instantly
    // with set() while the other properties animate continuously around it.
    style().set({ fontStyle: 'italic' });

    yield* parallel(
        weight().to({ fontWeight: 900 }, 1.6, easeInOut('quad')),
        tracking().to({ letterSpacing: 18 }, 1.6, easeInOut('quad')),
        leading().to({ lineHeight: 2.2 }, 1.6, easeInOut('quad')),
    );

    style().set({ fontStyle: 'normal' });

    yield* parallel(
        weight().to({ fontWeight: 200 }, 1.4, easeInOut('quad')),
        tracking().to({ letterSpacing: 2 }, 1.4, easeInOut('quad')),
        leading().to({ lineHeight: 1.2 }, 1.4, easeInOut('quad')),
    );

    yield* wait(1);
});
