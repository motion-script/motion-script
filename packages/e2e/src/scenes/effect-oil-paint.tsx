import { createRef, Rect, Image, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Effects.oilPaint}: Kuwahara brushwork — flat strokes, edges intact. */
const photo = createRef<Image>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect width={480} height={320} cornerRadius={20} clip={true} flow={'freeform'}>
                <Image ref={photo} src={'./cat.jpg'} fit={'fill'} width={'fill'} height={'fill'}
                    effects={Effects.oilPaint(0)} />
            </Rect>
        </Rect>,
    );
}, [
    () => photo().to({ effects: Effects.oilPaint(4) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
