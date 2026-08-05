import { createScene, createRef, Camera, GridPattern, Rect, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * Basic {@link GridPattern}: a world-anchored infinite grid viewed through a
 * {@link Camera}. Unlike a fixed {@link LineGrid}, the pattern is regenerated
 * each frame for exactly the camera's visible region, so panning the camera
 * scrolls the grid past while it always stays full — never revealing an empty
 * edge. A red marker rect sits at the world origin as a fixed reference the
 * grid slides relative to.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const camera = createRef<Camera>();
    stage.add(
        <Camera ref={camera} width={720} height={460} fill={'card'} cornerRadius={12} stroke={{ weight: 3, fill: '#2c3344' }}>
            <GridPattern
                cellSize={80}
                fill={Fills.color('card')}
                stroke={{ weight: 3, fill: 'primary' }}
            />
            <Rect width={56} height={56} cornerRadius={10} fill={'accent'} />
        </Camera>,
    );

    // Pan the camera across the world; the world-anchored grid scrolls past and
    // stays full, regenerating only the lines currently on screen.
    yield* camera().to({ lookAt: { x: 240, y: 120 } }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
