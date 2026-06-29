/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Text, wait } from '@motion-script/core';
import { holdTail } from './_lib';

/**
 * Cycles one wrapped paragraph through every `textAlign` value — start, center,
 * end, justify — switching every ~0.4s. `textAlign` is an enum so each change
 * is an instant `set()`; the mid frame lands on one of the centered/justified
 * modes so the alignment difference is visible.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const para = createRef<Text>();
    const label = createRef<Text>();

    const text =
        'Each line of this wrapped paragraph sits inside the box according to the current textAlign mode.';

    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                width={680}
                height={400}
                cornerRadius={20}
                fill={'card'}
                group={'column'}
                gap={20}
                padding={40}
            >
                <Text
                    ref={label}
                    text={'start'}
                    fontSize={28}
                    fontWeight={700}
                    fill={'primary'}
                    width={'fill'}
                    textAlign={'start'}
                />
                <Text
                    ref={para}
                    text={text}
                    fontSize={36}
                    fontWeight={500}
                    fill={'#f4f6ff'}
                    width={'fill'}
                    wrap={true}
                    textAlign={'start'}
                />
            </Rect>
        </Rect>,
    );

    const show = function* (align: 'start' | 'center' | 'end' | 'justify') {
        label().set({ text: align });
        para().set({ textAlign: align });
        yield* wait(0.4);
    };

    yield* show('start');
    yield* show('center');
    yield* show('end');
    yield* show('justify');

    yield* holdTail(1.6);
});
