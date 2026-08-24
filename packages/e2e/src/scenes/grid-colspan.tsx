import { createScene, createRef, Grid, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Grid} child `colSpan`: the accent cell grows from spanning 1 column to spanning all 3. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const wide = createRef<Rect>();
    stage.add(
        <Grid width={700} height={380} columns={3} gap={16} center={() => stage.canvas.center}>
            <Rect ref={wide} height={'fill'} colSpan={1} fill={'accent'} cornerRadius={12} />
            <Rect height={'fill'} fill={'primary'} cornerRadius={12} />
            <Rect height={'fill'} fill={'primary'} cornerRadius={12} />
            <Rect height={'fill'} fill={'primary'} cornerRadius={12} />
        </Grid>,
    );

    yield* wide().to({ colSpan: 3 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
