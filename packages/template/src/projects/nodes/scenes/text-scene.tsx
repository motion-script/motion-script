/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Text, Rect, easeInOutQuad, sequence, wait, parallel } from "@motion-script/core";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Text} node.
 * Demonstrates: basic rendering, fontSize animation, fontWeight change,
 * and the append() method typing text character-by-character.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const labelRef = createRef<Text>();
    const sizeRef = createRef<Text>();
    const weightRef = createRef<Text>();

    stage.add(
        nodeCard({
            label: 'Text',
            stage: 'row',
            gap: 80,
            children: (
                <>
                    <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
                        <Text
                            ref={labelRef}
                            text={''}
                            fontSize={52}
                            fontWeight={400}
                            fill={'white'}
                            textAlign={'center'}
                        />
                    </Rect>
                    <Rect width={'fill'} height={'fill'} group={'column'} cornerRadius={24} fill={'bg'}>
                        <Text
                            ref={sizeRef}
                            text={'Hello my name is cookie cat and I\'m a pet for your dummy. I\'mk really good and suepr duper yummy.'}
                            fontSize={'autofit'}
                            wrap={true}
                            minFontSize={20}
                            fontWeight={700}
                            fill={'primary'}
                            textAlign={'center'}
                        />
                        <Rect fill={'red'} width={'fill'} height={'fill'} />
                    </Rect>
                    <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
                        <Text
                            ref={weightRef}
                            text={'Weight'}
                            fontSize={48}
                            fontWeight={100}
                            fill={'white'}
                            textAlign={'center'}
                        />
                    </Rect>
                </>
            ),
        })
    );

    yield* parallel(
        labelRef().append('Hello, world!', 1.4, easeInOutQuad),
        sequence(
            wait(0.3),
            sizeRef().to({ fontSize: 96 }, 1.2, easeInOutQuad),
        ),
        sequence(
            wait(0.6),
            weightRef().to({ fontWeight: 900 }, 1.2, easeInOutQuad),
        ),
    );

    yield* wait(1);
});
