import { createScene, createRef, LineGrid, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * Exercises {@link LineGrid.subdivisions}: a fixed grid of 4 major divisions
 * with a distinct, lighter dashed `subStroke` for the minor lines. The
 * subdivision count animates 1 → 4, so the mid frame catches the minor lines
 * densifying inside each major cell.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const grid = createRef<LineGrid>();
    stage.add(
        <LineGrid
            ref={grid}
            width={480}
            height={480}
            divisions={4}
            subdivisions={1}
            fill={Fills.color('card')}
            stroke={{ weight: 4, fill: 'primary' }}
            subStroke={{ weight: 1.5, fill: 'accent', dash: 6 }}
            shadow={{ fill: Fills.color('black', { opacity: 0.5 }), offset: { x: 0, y: 12 }, blur: 28 }}
        />,
    );

    // Densify the minor lines: each major cell splits into four.
    yield* grid().to({ subdivisions: 4 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
