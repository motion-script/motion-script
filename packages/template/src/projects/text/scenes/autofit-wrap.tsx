/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Text, Rect, wait, easeInOut } from "@motion-script/core";

const BG = '#0D0F15';

/**
 * A {@link Text} node with `wrap: true` and `fontSize: 'autofit'` shrinking
 * to keep a growing paragraph inside a fixed box — `minFontSize` is the floor
 * it won't shrink past. Resizing the box itself (rather than the text) shows
 * autofit reacting to either side of the equation: more text or less room.
 */
export default createScene(function* (stage) {
    stage.set({ fill: BG });

    const boxRef = createRef<Rect>();
    const textRef = createRef<Text>();

    stage.add(
        <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
            <Text fontFamily={'Pixelify Sans'} text={'Autofit + Wrap'} fontSize={80} fill={'gray'} width={'fill'} textAlign={'start'} />
            <Rect width={'fill'} height={'fill'} fill={'card'} cornerRadius={32} group={'stack'} padding={80}>
                <Rect ref={boxRef} width={900} height={500} cornerRadius={20} stroke={{ fill: 'orange', weight: 6 }} padding={40}>
                    <Text
                        ref={textRef}
                        text={'Shrinks to fit.'}
                        fontSize={'autofit'}
                        minFontSize={28}
                        wrap={true}
                        width={'fill'}
                        fill={'white'}
                        textAlign={'center'}
                    />
                </Rect>
            </Rect>
        </Rect>
    );

    yield* wait(0.4);

    // More text, same box: the font shrinks line by line to keep wrapping inside it.
    yield* textRef().to({ text: 'Shrinks to fit. Keep adding text and the font size keeps stepping down to stay inside the box.' }, 1.8, easeInOut('quad'));
    yield* wait(0.4);

    // Same text, shrinking box: autofit reacts to less room just the same way.
    yield* boxRef().to({ width: 480, height: 320 }, 1.6, easeInOut('quad'));
    yield* wait(0.4);

    // Hits minFontSize: the box keeps shrinking but the text can't shrink further,
    // so it starts overflowing instead.
    yield* boxRef().to({ width: 260, height: 200 }, 1.4, easeInOut('quad'));
    yield* wait(0.6);

    yield* boxRef().to({ width: 900, height: 500 }, 1.2, easeInOut('quad'));
    yield* wait(1);
});
