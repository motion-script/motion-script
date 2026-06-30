import { createScene, createRef, Rect, Grid, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.bulge} with positive `strength`: a barrel-distortion lens magnifies the center and pins the edges. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Grid>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
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

    yield* card().to({ effects: Effects.bulge(0.9) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
