/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, RichText, Rect, Text, easeInOutQuad, wait } from "@motion-script/core";

const BG = '#0D0F15';
const BLUE = '#6990DD';
const COPPER = '#C07840';

/**
 * {@link RichText} spans nest Flutter-style: a span with `children` and no
 * `text` of its own acts as a pure style scope, and every child inherits any
 * field its parent set unless it redeclares it. Here a bold-italic scope
 * wraps two children that both inherit the weight/style but pick their own
 * fill, and a nested grandchild bumps just the size while keeping everything
 * else inherited from two levels up.
 */
export default createScene(function* (stage) {
    stage.set({ fill: BG });

    const ref = createRef<RichText>();

    stage.add(
        <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
            <Text fontFamily={'Pixelify Sans'} text={'RichText — nested spans'} fontSize={80} fill={'gray'} width={'fill'} textAlign={'start'} />
            <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={32} fill={'card'} padding={80}>
                <RichText
                    ref={ref}
                    fontSize={48}
                    fill={'white'}
                    textAlign={'center'}
                    spans={[
                        { text: 'plain lead-in, ' },
                        {
                            // Style-only scope: no own text, just sets defaults
                            // for its children (bold + italic).
                            fontWeight: 800,
                            fontStyle: 'italic',
                            children: [
                                { text: 'bold italic blue', fill: BLUE },
                                { text: ' and ' },
                                { text: 'bold italic copper', fill: COPPER },
                                {
                                    // Grandchild: inherits weight+style from the
                                    // scope two levels up, only overrides size.
                                    children: [
                                        { text: ' (bigger)', fontSize: 72 },
                                    ],
                                },
                            ],
                        },
                    ]}
                />
            </Rect>
        </Rect>
    );

    yield* ref().to({ fontSize: 56 }, 1.2, easeInOutQuad);
    yield* ref().to({ fontSize: 40 }, 1, easeInOutQuad);
    yield* wait(1);
});
