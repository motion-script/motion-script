import { createRef, Rect, Text, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Effects.radialBlur} in zoom style: the smear grows with distance while the centre stays sharp. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={420}
                height={280}
                cornerRadius={20}
                fill={'card'}
                flow={'freeform'}
                align={{ x: 0, y: 0 }}
                effects={Effects.radialBlur({ amount: 0, samples: 24 })}
            >
                <Text text={'ZOOM'} fontFamily={'Inter'} fontWeight={800} fontSize={72} fill={'#f4f6ff'} />
            </Rect>
        </Rect>,
    );
}, [
    () => card().to({ effects: Effects.radialBlur({ amount: 0.5, samples: 24 }) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
