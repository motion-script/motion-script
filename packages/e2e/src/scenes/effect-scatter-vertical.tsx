import { createRef, Rect, Text, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Effects.scatter} with `axis: 'y'`: pixels jitter randomly only along the y-axis, smearing into horizontal streaks. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={360}
                height={240}
                cornerRadius={20}
                fill={'card'}
                flow={'freeform'}
                align={{ x: 0, y: 0 }}
                effects={Effects.scatter({ strength: 0, axis: 'y' })}
            >
                <Text text={'NOISE'} fontFamily={'Inter'} fontWeight={800} fontSize={56} fill={'primary'} />
            </Rect>
        </Rect>,
    );
}, [
    () => card().to({ effects: Effects.scatter({ strength: 24, axis: 'y' }) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
