import { createScene, createRef, MaskGroup, Ellipse, Rect, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link MaskGroup} in `'vector'` mode: a fast hard clip using only the mask's outline — no soft gradient falloff, just a crisp geometric boundary, here a growing circular window. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const mask = createRef<Ellipse>();
    stage.add(
        <MaskGroup mode={'vector'} width={'fill'} height={'fill'}>
            <Ellipse ref={mask} width={120} height={120} fill={'#ffffff'} />
            <Rect width={400} height={260} cornerRadius={20} fill={Fills.linearGradient(['#28d6c8', '#e83fd6'])} />
        </MaskGroup>,
    );

    yield* mask().to({ width: 520, height: 520 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
