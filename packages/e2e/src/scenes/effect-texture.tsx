import { createScene, createRef, Rect, Image, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * {@link Effects.texture}: an image multiplied over the content.
 *
 * Uses a file this project already ships — the effect takes any image, which is
 * the point: textures are supplied, not bundled.
 */
const SRC = './kingfisher.jpg';

export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const photo = createRef<Image>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect width={480} height={320} cornerRadius={20} clip={true} group={'stack'}>
                <Image ref={photo} src={'./cat.jpg'} fit={'fill'} width={'fill'} height={'fill'}
                    effects={Effects.texture({ src: SRC, amount: 0, scale: 3 })} />
            </Rect>
        </Rect>,
    );

    yield* photo().to(
        { effects: Effects.texture({ src: SRC, amount: 0.8, scale: 3, blend: 'overlay' }) },
        1.2,
        easeInOut('quad'),
    );
    yield* holdTail(1.2);
});
