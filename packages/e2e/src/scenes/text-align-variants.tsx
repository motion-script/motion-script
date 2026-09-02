import { createRef, driveCommand, Rect, Text } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * Cycles one wrapped paragraph through every `textAlign` value — start, center,
 * end, justify — switching every ~0.4s. `textAlign` is an enum so each change
 * is an instant `set()`; the mid frame lands on one of the centered/justified
 * modes so the alignment difference is visible.
 */
const para = createRef<Text>();
const label = createRef<Text>();

/**
 * Hold one alignment for `0.4s`.
 *
 * A command rather than a `set()` followed by a wait: it writes the same value
 * for every `t`, so the frame it produces depends only on where the playhead is,
 * not on having passed through the `set` on the way.
 */
const show = (align: 'start' | 'center' | 'end' | 'justify') => () =>
    driveCommand(0.4, () => {
        label().set({ text: align });
        para().set({ textAlign: align });
    });

export default scene((stage) => {
    stage.set({ fill: 'bg' });

    const text =
        'Each line of this wrapped paragraph sits inside the box according to the current textAlign mode.';

    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                width={680}
                height={400}
                cornerRadius={20}
                fill={'card'}
                flow={'vertical'}
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
}, [
    show('start'),
    show('center'),
    show('end'),
    show('justify'),
    holdTail(1.6),
]);
