import { createScene, createRef, Rect, Image, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.oilPaint}: Kuwahara brushwork — flat strokes, edges intact. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const photo = createRef<Image>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect width={480} height={320} cornerRadius={20} clip={true} flow={'freeform'}>
                <Image ref={photo} src={'./cat.jpg'} fit={'fill'} width={'fill'} height={'fill'}
                    effects={Effects.oilPaint(0)} />
            </Rect>
        </Rect>,
    );

    yield* photo().to({ effects: Effects.oilPaint(4) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
