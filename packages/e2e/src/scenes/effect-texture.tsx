import { createRef, Rect, Image, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * {@link Effects.texture}: an image multiplied over the content.
 *
 * Uses a file this project already ships — the effect takes any image, which is
 * the point: textures are supplied, not bundled.
 */
const SRC = './kingfisher.jpg';

const photo = createRef<Image>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect width={480} height={320} cornerRadius={20} clip={true} flow={'freeform'}>
                <Image ref={photo} src={'./cat.jpg'} fit={'fill'} width={'fill'} height={'fill'}
                    effects={Effects.texture({ src: SRC, amount: 0, scale: 3 })} />
            </Rect>
        </Rect>,
    );
}, [
    () => photo().to(
        { effects: Effects.texture({ src: SRC, amount: 0.8, scale: 3, blend: 'overlay' }) },
        1.2,
        easeInOut('quad'),
    ),
    holdTail(1.2),
]);
