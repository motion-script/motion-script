/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Text, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/**
 * A wrapped paragraph in a fixed-width box. Animating the box `width` narrower
 * forces the text to re-flow onto more lines, so the wrap is visibly exercised
 * (the mid frame catches the paragraph mid-reflow).
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const box = createRef<Rect>();

    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={box}
                width={620}
                height={360}
                cornerRadius={20}
                fill={'card'}
                group={'stack'}
                align={{ x: 0, y: 0 }}
                padding={40}
            >
                <Text
                    text={'Motion Script lays out wrapped text one line at a time, breaking on word boundaries to fit the box.'}
                    fontSize={40}
                    fontWeight={500}
                    fill={'#f4f6ff'}
                    width={'fill'}
                    wrap={true}
                    textAlign={'start'}
                />
            </Rect>
        </Rect>,
    );

    yield* box().to({ width: 320 }, 1.3, easeInOut('quad'));
    yield* holdTail(1.3);
});
