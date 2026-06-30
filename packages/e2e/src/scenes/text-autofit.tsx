import { createScene, createRef, Rect, Text, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * {@link Text} `fontSize={'autofit'}`: the glyph size scales to fill its box
 * automatically. Shrinking the box forces the same text to shrink with it,
 * down to `minFontSize`.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const box = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect ref={box} width={700} height={260} cornerRadius={16} fill={'card'} padding={20} group={'stack'} align={{ x: 0, y: 0 }}>
                <Text
                    text={'Autofit'}
                    fontFamily={'Inter'}
                    fontWeight={800}
                    fontSize={'autofit'}
                    minFontSize={12}
                    fill={'primary'}
                    width={'fill'}
                    height={'fill'}
                />
            </Rect>
        </Rect>,
    );

    yield* box().to({ width: 260, height: 120 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
