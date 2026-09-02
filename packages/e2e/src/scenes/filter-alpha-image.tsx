import { createRef, Rect, Fills, Adjustments, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Adjustments.alpha}: an image fill's opacity filter fading the image out from fully opaque to nearly transparent. */
const image = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={280}
                height={280}
                cornerRadius={24}
                fill={'card'}
            >
                <Rect
                    ref={image}
                    width={'fill'}
                    height={'fill'}
                    cornerRadius={24}
                    fill={Fills.image('cat.jpg', { fit: 'fill', filters: Adjustments.alpha(1) })}
                />
            </Rect>
        </Rect>,
    );
}, [
    () => image().to({ fill: Fills.image('cat.jpg', { fit: 'fill', filters: Adjustments.alpha(0.1) }) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
