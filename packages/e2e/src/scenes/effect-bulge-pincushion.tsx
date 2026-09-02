import { createRef, Rect, Grid, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Effects.bulge} with negative `strength`: a pincushion lens pinches the center inward instead of bulging outward. */
const card = createRef<Grid>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Grid
                ref={card}
                width={320}
                height={320}
                cornerRadius={20}
                fill={'card'}
                columns={4}
                gap={2}
                effects={Effects.bulge(0)}
            >
                <Rect width={'fill'} height={'fill'} fill={'#6990dd'} />
                <Rect width={'fill'} height={'fill'} fill={'#e8617c'} />
                <Rect width={'fill'} height={'fill'} fill={'#f2c94c'} />
                <Rect width={'fill'} height={'fill'} fill={'#6990dd'} />
                <Rect width={'fill'} height={'fill'} fill={'#e8617c'} />
                <Rect width={'fill'} height={'fill'} fill={'#f2c94c'} />
                <Rect width={'fill'} height={'fill'} fill={'#6990dd'} />
                <Rect width={'fill'} height={'fill'} fill={'#e8617c'} />
                <Rect width={'fill'} height={'fill'} fill={'#f2c94c'} />
                <Rect width={'fill'} height={'fill'} fill={'#6990dd'} />
                <Rect width={'fill'} height={'fill'} fill={'#e8617c'} />
                <Rect width={'fill'} height={'fill'} fill={'#f2c94c'} />
                <Rect width={'fill'} height={'fill'} fill={'#6990dd'} />
                <Rect width={'fill'} height={'fill'} fill={'#e8617c'} />
                <Rect width={'fill'} height={'fill'} fill={'#f2c94c'} />
                <Rect width={'fill'} height={'fill'} fill={'#6990dd'} />
            </Grid>
        </Rect>,
    );
}, [
    () => card().to({ effects: Effects.bulge(-0.9) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
