import { createScene, createRef, Rect, Text, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.outline}: a band grows outward from the glyph silhouette as `width` ramps up. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const label = createRef<Text>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Text
                ref={label}
                text={'EDGE'}
                fontFamily={'Inter'}
                fontWeight={800}
                fontSize={120}
                fill={'#f4f6ff'}
                effects={Effects.outline({ width: 0, color: 'accent' })}
            />
        </Rect>,
    );

    yield* label().to({ effects: Effects.outline({ width: 14, color: 'accent' }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
