

import { createScene, createRef, Text, Rect, wait, easeInOut } from "motion-script";

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
        <Rect width={500} height={'hug'} flow={'vertical'} padding={40} gap={10} stroke={{ weight: 2, fill: 'red' }}>
            <Rect ref={boxRef} width={'fill'} height={205} fill={'card'} />


            <Text wrap={true} height={'fill'} text={'Hello my name is amazing and hope this works'} fontSize={32} fill={'white'} width={'fill'} textAlign={'start'} />

        </Rect>
    );


    yield* wait(1);
});
