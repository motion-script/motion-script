import { createScene, createRef, Rect, Image, Text, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * {@link Effects.ascii}: the image resolves into a glyph grid as the cell grows.
 *
 * The `Text` node is load-bearing, not decoration: the atlas is baked from a
 * *registered* font, and a scene with no text registers none — the effect then
 * has nothing to draw with and degrades to a no-op. Naming the same family on
 * the effect keeps the bake off the fallback path.
 *
 * `standard` is plain ASCII, so it renders in any Latin font; `blocks` and
 * `braille` would need one covering those Unicode ranges.
 */
const FAMILY = 'Inter';
const style = { charset: 'standard' as const, fontFamily: FAMILY, ink: '#7dff9b', background: '#04120a' };

export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const photo = createRef<Image>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'vertical'} gap={20} align={{ x: 0, y: 0 }}>
            <Rect width={480} height={300} cornerRadius={20} clip={true} flow={'freeform'}>
                <Image
                    ref={photo}
                    src={'./cat.jpg'}
                    fit={'fill'}
                    width={'fill'}
                    height={'fill'}
                    effects={Effects.ascii({ size: 3, ...style })}
                />
            </Rect>
            <Text text={'ascii'} fontFamily={FAMILY} fontSize={24} fill={'#7dff9b'} />
        </Rect>,
    );

    yield* photo().to({ effects: Effects.ascii({ size: 12, ...style }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
