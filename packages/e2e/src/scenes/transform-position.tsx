import { createScene, createRef, Ellipse, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** A circle animating its x/y position across the viewport. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const ball = createRef<Ellipse>();
    stage.add(<Ellipse ref={ball} width={120} height={120} fill={'primary'} x={-300} y={-120} />);

    yield* ball().to({ x: 300, y: 120 }, 1.4, easeInOut('cubic'));
    yield* holdTail(1.4);
});
