import { createScene, createRef, Rect, Image, Presets, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Presets.comic}: the Comic recipe on a CMYK process screen. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const photo = createRef<Image>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect width={480} height={320} cornerRadius={20} clip={true} group={'stack'}>
                <Image ref={photo} src={'./cat.jpg'} fit={'fill'} width={'fill'} height={'fill'}
                    effects={Presets.comic(0)} />
            </Rect>
        </Rect>,
    );

    yield* photo().to({ effects: Presets.comic(1) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
