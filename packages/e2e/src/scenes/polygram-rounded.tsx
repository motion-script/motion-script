import { createScene, createRef, Polygram, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Polygram.cornerRadius}: a sharp 5-point star rounding both its inner and outer vertices. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const star = createRef<Polygram>();
    stage.add(
        <Polygram
            ref={star}
            width={300}
            height={300}
            sides={5}
            cornerRadius={0}
            fill={'accent'}
            center={() => stage.canvas.center}
        />,
    );

    yield* star().to({ cornerRadius: 24 }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
