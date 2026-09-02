import { createRef, MaskGroup, Ellipse, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link MaskGroup} in `'vector'` mode: a fast hard clip using only the mask's outline — no soft gradient falloff, just a crisp geometric boundary, here a growing circular window. */
const mask = createRef<Ellipse>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <MaskGroup mode={'vector'} width={'fill'} height={'fill'}>
            <Ellipse ref={mask} width={120} height={120} fill={'#ffffff'} />
            <Rect width={400} height={260} cornerRadius={20} fill={Fills.linearGradient(['#28d6c8', '#e83fd6'])} />
        </MaskGroup>,
    );
}, [
    () => mask().to({ width: 520, height: 520 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
