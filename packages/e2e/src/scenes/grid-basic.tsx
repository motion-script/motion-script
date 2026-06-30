import { createScene, createRef, Grid, Rect, easeOut } from 'motion-script';
import { holdTail } from './_lib';

/** Basic {@link Grid}: six cells auto-placed into 3 equal-width columns, popping in together. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const grid = createRef<Grid>();
    stage.add(
        <Grid ref={grid} width={700} height={380} columns={3} gap={16} scale={0} center={() => stage.root.center}>
            <Rect height={'fill'} fill={'primary'} cornerRadius={12} />
            <Rect height={'fill'} fill={'accent'} cornerRadius={12} />
            <Rect height={'fill'} fill={'primary'} cornerRadius={12} />
            <Rect height={'fill'} fill={'accent'} cornerRadius={12} />
            <Rect height={'fill'} fill={'primary'} cornerRadius={12} />
            <Rect height={'fill'} fill={'accent'} cornerRadius={12} />
        </Grid>,
    );

    yield* grid().to({ scale: 1 }, 1.1, easeOut('back'));
    yield* holdTail(1.1);
});
