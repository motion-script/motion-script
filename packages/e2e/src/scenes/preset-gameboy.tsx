import { createScene, createRef, Rect, Image, Presets, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Presets.gameboy}: the GameBoy recipe ramping in from its no-op state. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Image>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect width={480} height={320} cornerRadius={20} clip={true} group={'stack'}>
                <Image
                    ref={card}
                    src={'./cat.jpg'}
                    fit={'fill'}
                    width={'fill'}
                    height={'fill'}
                    effects={Presets.gameboy(0)}
                />
            </Rect>
        </Rect>,
    );

    yield* card().to({ effects: Presets.gameboy(1) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
