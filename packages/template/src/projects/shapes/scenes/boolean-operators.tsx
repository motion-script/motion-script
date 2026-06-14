/** @jsxImportSource @motion-script/core/jsx */

import {
    Scene, createRef, Text, Rect, Ellipse, BooleanGroup,
    Fills, BooleanOperation, easeInOutQuad, parallel,
} from "@motion-script/core";

/** One labelled cell: a named boolean op applied to two overlapping circles. */
interface OpSpec {
    op: BooleanOperation;
    label: string;
}

/**
 * Walks through every Figma-style boolean operation in one scene. A 2x2 grid
 * of cells each holds a {@link BooleanGroup} combining the same pair of
 * overlapping circles under a different `op` (union | subtract | intersect |
 * exclude), so the four silhouettes can be compared side by side.
 *
 * The two source circles slide apart and back together in a loop, so you can
 * watch how each operation responds as the overlap shrinks and grows — union
 * stays a blob, intersect vanishes when they separate, subtract bites a
 * crescent, and exclude punches out the shared core.
 */
export class BooleanOperatorScene extends Scene {
    readonly label = 'Boolean Operations';

    private readonly ops: OpSpec[] = [
        { op: 'union', label: 'Union' },
        { op: 'subtract', label: 'Subtract' },
        { op: 'intersect', label: 'Intersect' },
        { op: 'exclude', label: 'Exclude' },
    ];

    *build() {
        this.set({ fill: 'bg' });

        const radius = 200;
        // Horizontal offset of each circle from its cell center. The pair
        // overlaps near the middle; the animation widens then restores the gap.
        const spread = 70;

        // Two refs per cell (left + right circle) so every op animates in sync.
        const cellRefs = this.ops.map(() => ({
            left: createRef<Ellipse>(),
            right: createRef<Ellipse>(),
        }));

        const cell = (spec: OpSpec, i: number) => {
            const { left, right } = cellRefs[i];
            return (
                <Rect width={'fill'} height={'fill'} group={'column'} gap={16}>
                    <Rect
                        width={'fill'} height={'fill'}
                        fill={'card'} cornerRadius={32}
                        clip={true} group={'stack'}
                    >
                        <BooleanGroup op={spec.op} fill={Fills.color('#6990DD')}>
                            <Ellipse ref={left} x={-spread} width={radius} height={radius} />
                            <Ellipse ref={right} x={spread} width={radius} height={radius} />
                        </BooleanGroup>
                    </Rect>
                    <Text
                        fontFamily={'Pixelify Sans'} text={spec.label}
                        fontSize={56} fill={'gray'} width={'fill'} align={'center'}
                    />
                </Rect>
            );
        };

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={this.label} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} group={'column'} gap={48}>
                    <Rect width={'fill'} height={'fill'} group={'row'} gap={48}>
                        {cell(this.ops[0], 0)}
                        {cell(this.ops[1], 1)}
                    </Rect>
                    <Rect width={'fill'} height={'fill'} group={'row'} gap={48}>
                        {cell(this.ops[2], 2)}
                        {cell(this.ops[3], 3)}
                    </Rect>
                </Rect>
            </Rect>
        );

        const wide = spread + 90;
        const animate = (x: number) => parallel(
            ...cellRefs.flatMap(({ left, right }) => [
                left().to({ x: -x }, 2, easeInOutQuad),
                right().to({ x }, 2, easeInOutQuad),
            ]),
        );

        // Pull the pairs apart so the operations diverge, then close them back
        // up so the scene loops cleanly.
        yield* animate(wide);
        yield* animate(spread);
    }
}
