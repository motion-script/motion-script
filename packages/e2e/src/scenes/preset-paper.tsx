import { createScene, createRef, Rect, Image, Presets, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Presets.paper}: the texture-based material template. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const photo = createRef<Image>();
    const opts = { src: './kingfisher.jpg', scale: 3 };
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect width={480} height={320} cornerRadius={20} clip={true} group={'stack'}>
                <Image ref={photo} src={'./cat.jpg'} fit={'fill'} width={'fill'} height={'fill'}
                    effects={Presets.paper({ amount: 0, ...opts })} />
            </Rect>
        </Rect>,
    );

    yield* photo().to({ effects: Presets.paper({ amount: 1, ...opts }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
