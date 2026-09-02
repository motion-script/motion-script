import { createRef, LineGrid, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * Exercises {@link LineGrid.subdivisions}: a fixed grid of 4 major divisions
 * with a distinct, lighter dashed `subStroke` for the minor lines. The
 * subdivision count animates 1 → 4, so the mid frame catches the minor lines
 * densifying inside each major cell.
 */
const grid = createRef<LineGrid>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });

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
}, [
    // Densify the minor lines: each major cell splits into four.
    () => grid().to({ subdivisions: 4 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
