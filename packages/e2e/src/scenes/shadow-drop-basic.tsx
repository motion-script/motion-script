import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** A basic drop shadow whose blur + offset grow as the card lifts off the surface. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={320}
                height={220}
                cornerRadius={20}
                fill={'#f4f6ff'}
                shadow={{ blur: 4, offset: { x: 0, y: 2 }, fill: '#000000' }}
            />
        </Rect>,
    );
}, [
    () => card().to(
        { shadow: { blur: 48, offset: { x: 0, y: 32 }, fill: '#000000' } },
        1.2,
        easeInOut('quad'),
    ),
    holdTail(1.2),
]);
