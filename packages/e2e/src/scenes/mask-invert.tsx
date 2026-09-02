import { createRef, MaskGroup, Ellipse, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link MaskGroup}'s `inverted` flag flipping the mask to subtract mode: content shows everywhere the mask shape is NOT, so a growing circle now punches a hole instead of opening a window. */
const mask = createRef<Ellipse>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <MaskGroup mode={'vector'} inverted={true} width={'fill'} height={'fill'}>
            <Ellipse ref={mask} width={80} height={80} fill={'#ffffff'} />
            <Rect width={400} height={260} cornerRadius={20} fill={Fills.linearGradient(['#28d6c8', '#e83fd6'])} />
        </MaskGroup>,
    );
}, [
    () => mask().to({ width: 260, height: 260 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
