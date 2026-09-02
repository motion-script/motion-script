import { createRef, Grid, Rect, easeOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Basic {@link Grid}: six cells auto-placed into 3 equal-width columns, popping in together. */
const grid = createRef<Grid>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Grid ref={grid} width={700} height={380} columns={3} gap={16} scale={0} center={() => stage.canvas.center}>
            <Rect height={'fill'} fill={'primary'} cornerRadius={12} />
            <Rect height={'fill'} fill={'accent'} cornerRadius={12} />
            <Rect height={'fill'} fill={'primary'} cornerRadius={12} />
            <Rect height={'fill'} fill={'accent'} cornerRadius={12} />
            <Rect height={'fill'} fill={'primary'} cornerRadius={12} />
            <Rect height={'fill'} fill={'accent'} cornerRadius={12} />
        </Grid>,
    );
}, [
    () => grid().to({ scale: 1 }, 1.1, easeOut('back')),
    holdTail(1.1),
]);
