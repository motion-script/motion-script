import { describe, it, expect } from 'vitest';
import {
    FlexChild,
    FlexMeasureInput,
    FlexLayoutInput,
    layoutFlex,
    measureFlex,
} from '@/layout/flex';
import { SizeConstraints } from '@/attributes/layout/constraints';
import { InsetsResolved } from '@/attributes/layout/insets';
import { BoxBounds } from '@/attributes/layout/bounds';
import { Size2D, SizeInput } from '@/attributes/layout/size';

// ── Helpers ─────────────────────────────────────────────────────────

function child(widthMode: SizeInput, heightMode: SizeInput, flex?: number): FlexChild {
    return {
        widthMode,
        heightMode,
        mainFlex: flex,
        measure: (c: SizeConstraints): Partial<Size2D> => {
            const w = typeof widthMode === 'number'
                ? widthMode
                : widthMode === 'fill'
                    ? c.maxWidth ?? 0
                    : 0;
            const h = typeof heightMode === 'number'
                ? heightMode
                : heightMode === 'fill'
                    ? c.maxHeight ?? 0
                    : 0;
            return { width: w, height: h };
        },
    };
}

/**
 * Simulates a wrapping {@link Text}-like child: its `fill` axes report a
 * fixed intrinsic content size regardless of the incoming constraint
 * (mirroring how `Text.measure()` reports wrapped line height even when
 * asked to "fill"), rather than echoing back whatever constraint it's given.
 */
function intrinsicChild(
    widthMode: SizeInput,
    heightMode: SizeInput,
    intrinsicWidth: number,
    intrinsicHeight: number,
    flex?: number,
): FlexChild {
    return {
        widthMode,
        heightMode,
        mainFlex: flex,
        measure: (): Partial<Size2D> => ({
            width: typeof widthMode === 'number' ? widthMode : intrinsicWidth,
            height: typeof heightMode === 'number' ? heightMode : intrinsicHeight,
        }),
    };
}

const NO_PAD: InsetsResolved = { left: 0, right: 0, top: 0, bottom: 0 };

function measureInput(over: Partial<FlexMeasureInput> = {}): FlexMeasureInput {
    return {
        direction: 'row',
        innerWidth: 1000,
        innerHeight: 1000,
        gap: 0,
        parentWidthMode: 1000,
        parentHeightMode: 1000,
        ...over,
    };
}

function rect(w: number, h: number): BoxBounds {
    return { x: 0, y: 0, width: w, height: h };
}

// ── measureFlex ──────────────────────────────────────────────────────

describe('measureFlex – fixed children, row', () => {
    it('returns one entry per child', () => {
        const result = measureFlex([child(100, 50), child(200, 80)], measureInput());
        expect(result.entries).toHaveLength(2);
    });

    it('measures fixed widths and heights from each child', () => {
        const result = measureFlex([child(100, 50), child(200, 80)], measureInput());
        expect(result.entries[0].width).toBe(100);
        expect(result.entries[0].height).toBe(50);
        expect(result.entries[1].width).toBe(200);
        expect(result.entries[1].height).toBe(80);
    });

    it('hugWidth is the sum of fixed main sizes (no gap)', () => {
        const result = measureFlex([child(100, 50), child(200, 80)], measureInput());
        expect(result.hugWidth).toBe(300);
    });

    it('hugHeight is the max cross size', () => {
        const result = measureFlex([child(100, 50), child(200, 80)], measureInput());
        expect(result.hugHeight).toBe(80);
    });

    it('isFlexibleMain is false for fixed-main children', () => {
        const result = measureFlex([child(100, 50)], measureInput());
        expect(result.entries[0].isFlexibleMain).toBe(false);
    });
});

describe('measureFlex – column direction', () => {
    it('swaps which axis is main', () => {
        const result = measureFlex(
            [child(50, 100), child(80, 200)],
            measureInput({ direction: 'column' }),
        );
        expect(result.hugHeight).toBe(300);
        expect(result.hugWidth).toBe(80);
    });

    it('isFlexibleMain depends on heightMode when column', () => {
        const result = measureFlex(
            [child(100, 'fill'), child(100, 50)],
            measureInput({ direction: 'column' }),
        );
        expect(result.entries[0].isFlexibleMain).toBe(true);
        expect(result.entries[1].isFlexibleMain).toBe(false);
    });
});

describe('measureFlex – fill children', () => {
    it('distributes remaining space evenly across fill children', () => {
        const result = measureFlex(
            [child(100, 50), child('fill', 50), child('fill', 50)],
            measureInput({ innerWidth: 500 }),
        );
        // 500 - 100 = 400 remaining, split between 2 fill → 200 each
        expect(result.entries[1].width).toBe(200);
        expect(result.entries[2].width).toBe(200);
    });

    it('respects gap when distributing fill space', () => {
        const result = measureFlex(
            [child('fill', 50), child('fill', 50)],
            measureInput({ innerWidth: 500, gap: 20 }),
        );
        // 500 - 20 (one gap) = 480 split between 2 → 240
        expect(result.entries[0].width).toBe(240);
        expect(result.entries[1].width).toBe(240);
    });

    it('gives zero to fill children when no space remains', () => {
        const result = measureFlex(
            [child(500, 50), child('fill', 50)],
            measureInput({ innerWidth: 500 }),
        );
        expect(result.entries[1].width).toBe(0);
    });

    it('flex child cross size matches innerCross when parent fills cross', () => {
        const result = measureFlex(
            [child('fill', 'fill')],
            measureInput({ innerWidth: 200, innerHeight: 100, parentHeightMode: 100 }),
        );
        expect(result.entries[0].height).toBe(100);
    });
});

describe('measureFlex – flex weights', () => {
    it('splits remaining space by flex weight (2:1)', () => {
        const result = measureFlex(
            [child(100, 50), child('fill', 50, 2), child('fill', 50, 1)],
            measureInput({ innerWidth: 500 }),
        );
        // 500 - 100 = 400 free, split 2:1 → 266.67 / 133.33
        expect(result.entries[1].width).toBeCloseTo(400 * 2 / 3);
        expect(result.entries[2].width).toBeCloseTo(400 / 3);
    });

    it('subtracts gap before applying weights', () => {
        const result = measureFlex(
            [child('fill', 50, 3), child('fill', 50, 1)],
            measureInput({ innerWidth: 500, gap: 20 }),
        );
        // 500 - 20 (one gap) = 480 free, split 3:1 → 360 / 120
        expect(result.entries[0].width).toBe(360);
        expect(result.entries[1].width).toBe(120);
    });

    it('a lone fill child takes all free space regardless of its flex', () => {
        const result = measureFlex(
            [child(100, 50), child('fill', 50, 5)],
            measureInput({ innerWidth: 500 }),
        );
        expect(result.entries[1].width).toBe(400);
    });

    it('flex 0 takes no space; sibling absorbs the rest', () => {
        const result = measureFlex(
            [child('fill', 50, 0), child('fill', 50, 1)],
            measureInput({ innerWidth: 500 }),
        );
        expect(result.entries[0].width).toBe(0);
        expect(result.entries[1].width).toBe(500);
    });

    it('all-zero flex collapses every fill child to zero', () => {
        const result = measureFlex(
            [child('fill', 50, 0), child('fill', 50, 0)],
            measureInput({ innerWidth: 500 }),
        );
        expect(result.entries[0].width).toBe(0);
        expect(result.entries[1].width).toBe(0);
    });

    it('sanitizes negative / NaN flex to 1 (behaves as equal split)', () => {
        const result = measureFlex(
            [child('fill', 50, -3), child('fill', 50, NaN)],
            measureInput({ innerWidth: 500 }),
        );
        expect(result.entries[0].width).toBe(250);
        expect(result.entries[1].width).toBe(250);
    });

    it('weights the main axis in a column', () => {
        const result = measureFlex(
            [child(50, 'fill', 3), child(50, 'fill', 1)],
            measureInput({ direction: 'column', innerHeight: 400 }),
        );
        expect(result.entries[0].height).toBe(300);
        expect(result.entries[1].height).toBe(100);
    });

    it('flex does not affect cross-axis fill', () => {
        const result = measureFlex(
            [child('fill', 'fill', 9)],
            measureInput({ innerWidth: 200, innerHeight: 100, parentHeightMode: 100 }),
        );
        // cross (height) fills to innerHeight irrespective of flex
        expect(result.entries[0].height).toBe(100);
    });

    it('hug-main + fill-main children measure unconstrained, ignoring flex weight', () => {
        // Figma disallows "Fill container" on the axis a parent hugs, so a
        // fill-main child here measures like a hug child: its own intrinsic
        // size, regardless of flex weight (there's no real space to divide).
        const result = measureFlex(
            [child(80, 50), intrinsicChild('fill', 50, 60, 50, 3), intrinsicChild('fill', 50, 20, 50, 1)],
            measureInput({ parentWidthMode: 'hug' }),
        );
        expect(result.entries[1].width).toBe(60);
        expect(result.entries[2].width).toBe(20);
        // hugWidth now includes every child's real measured size (80+60+20)
        expect(result.hugWidth).toBe(160);
    });
});

describe('measureFlex – parent hug behavior', () => {
    it('hugMain counts fixed-main contributions plus gaps when parent hugs main', () => {
        const result = measureFlex(
            [child(100, 50), child(200, 50)],
            measureInput({
                innerWidth: 1000,
                gap: 10,
                parentWidthMode: 'hug',
            }),
        );
        // hugWidth = 100 + 200 + 10 (one gap) = 310
        expect(result.hugWidth).toBe(310);
    });

    it('parent hug main + fill-main child measures its own intrinsic size, not a borrowed share', () => {
        // When parent hugs main, there's no real remaining space — Figma
        // disallows this combination in the UI. We measure the child like a
        // hug child instead: its own intrinsic content size, here 30.
        const result = measureFlex(
            [intrinsicChild('fill', 50, 30, 50)],
            measureInput({ parentWidthMode: 'hug' }),
        );
        expect(result.entries[0].width).toBe(30);
        expect(result.hugWidth).toBe(30);
    });

    it('parent hug main + fill-main child with no intrinsic size collapses to 0, not Infinity', () => {
        // A fill-main child with no content-driven intrinsic size (unlike
        // Text, which always has wrapped/unwrapped line width) measures as
        // Infinity when probed unconstrained — there's nothing real to hug
        // to. This combination now only arises from an explicit author
        // override (Rect/FlexNode default their own main-axis mode to "fill"
        // at construction time when a direct child requests fill on that
        // axis), so it's a deliberate "collapse to 0" rather than a promotion:
        // an Infinity here would otherwise propagate into the container's hug
        // size and make the whole thing disappear.
        const result = measureFlex(
            [child('fill', 50)],
            measureInput({ parentWidthMode: 'hug' }),
        );
        expect(result.entries[0].width).toBe(0);
        expect(result.hugWidth).toBe(0);
    });

    it('hug-main column with a fixed child and a wrapping fill-height child hugs to both (wrap-bounds regression)', () => {
        // Mirrors the wrap-bounds.tsx scene: a hug-height column containing a
        // fixed-height box and a wrapping Text with height: 'fill'. The
        // column must grow to fit the text's real wrapped content height,
        // not just the fixed sibling.
        const result = measureFlex(
            [
                child(500, 205),
                intrinsicChild('fill', 'fill', 500, 77),
            ],
            measureInput({
                direction: 'column',
                innerWidth: 500,
                innerHeight: 1000,
                gap: 10,
                parentWidthMode: 500,
                parentHeightMode: 'hug',
            }),
        );
        expect(result.entries[1].height).toBe(77);
        // hugHeight = 205 (fixed) + 77 (wrapped text) + 10 (gap) = 292
        expect(result.hugHeight).toBe(292);
    });

    it('hug-cross parent anchors fill-cross children to maxCross', () => {
        // First child is 80 cross, second is fill-cross. Parent hugs cross →
        // maxCross anchor is 80, so fill-cross child becomes 80.
        const result = measureFlex(
            [child(50, 80), child(50, 'fill')],
            measureInput({
                innerHeight: 1000,
                parentHeightMode: 'hug',
            }),
        );
        expect(result.entries[1].height).toBe(80);
    });
});

describe('measureFlex – edge cases', () => {
    it('handles an empty child list', () => {
        const result = measureFlex([], measureInput());
        expect(result.entries).toHaveLength(0);
        expect(result.hugWidth).toBe(0);
        expect(result.hugHeight).toBe(0);
    });

    it('returns the single child sizes when only one child', () => {
        const result = measureFlex([child(123, 45)], measureInput());
        expect(result.hugWidth).toBe(123);
        expect(result.hugHeight).toBe(45);
    });
});

// ── layoutFlex ───────────────────────────────────────────────────────

function layoutInput(over: Partial<FlexLayoutInput> = {}): FlexLayoutInput {
    return {
        direction: 'row',
        entries: [],
        rect: rect(1000, 1000),
        innerWidth: 1000,
        innerHeight: 1000,
        gap: 0,
        alignment: { x: -1, y: -1 },
        padding: NO_PAD,
        ...over,
    };
}

describe('layoutFlex – start alignment', () => {
    it('places first child at left edge in a row', () => {
        const entries = [
            { child: child(100, 50), width: 100, height: 50, isFlexibleMain: false },
        ];
        const result = layoutFlex(layoutInput({
            entries,
            rect: rect(500, 200),
            innerWidth: 500,
            innerHeight: 200,
            alignment: { x: -1, y: -1 },
        }));
        // start in row: mainPos = -500/2 = -250; child center = -250 + 100/2 = -200
        expect(result[0].x).toBe(-200);
    });

    it('places second child at firstWidth + gap from first', () => {
        const entries = [
            { child: child(100, 50), width: 100, height: 50, isFlexibleMain: false },
            { child: child(80, 50), width: 80, height: 50, isFlexibleMain: false },
        ];
        const result = layoutFlex(layoutInput({
            entries,
            rect: rect(500, 200),
            innerWidth: 500,
            innerHeight: 200,
            gap: 20,
            alignment: { x: -1, y: -1 },
        }));
        // First centerX = -200. Next mainPos = -250+100+20 = -130, center = -130+40 = -90
        expect(result[1].x).toBe(-90);
    });
});

describe('layoutFlex – center alignment', () => {
    it('centers a single child horizontally in a row', () => {
        const entries = [
            { child: child(100, 50), width: 100, height: 50, isFlexibleMain: false },
        ];
        const result = layoutFlex(layoutInput({
            entries,
            rect: rect(500, 200),
            innerWidth: 500,
            innerHeight: 200,
            alignment: { x: 0, y: 0 },
        }));
        // mainPos = -totalMain/2 = -50, center = 0
        expect(result[0].x).toBe(0);
        expect(result[0].y).toBe(0);
    });
});

describe('layoutFlex – end alignment', () => {
    it('places last child flush to the right edge', () => {
        const entries = [
            { child: child(100, 50), width: 100, height: 50, isFlexibleMain: false },
        ];
        const result = layoutFlex(layoutInput({
            entries,
            rect: rect(500, 200),
            innerWidth: 500,
            innerHeight: 200,
            alignment: { x: 1, y: -1 },
        }));
        // mainPos = 500/2 - 100 = 150, center = 150 + 50 = 200
        expect(result[0].x).toBe(200);
    });
});

describe('layoutFlex – auto gap', () => {
    it('distributes remaining inner space across gaps', () => {
        const entries = [
            { child: child(100, 50), width: 100, height: 50, isFlexibleMain: false },
            { child: child(100, 50), width: 100, height: 50, isFlexibleMain: false },
            { child: child(100, 50), width: 100, height: 50, isFlexibleMain: false },
        ];
        const result = layoutFlex(layoutInput({
            entries,
            rect: rect(900, 200),
            innerWidth: 900,
            innerHeight: 200,
            gap: 'auto',
            alignment: { x: -1, y: -1 },
        }));
        // 3 children = 300 main, 2 gaps = (900-300)/2 = 300 each
        // first center = -450 + 50 = -400, then -400 + 100 + 300 = 0, then 400
        expect(result[0].x).toBe(-400);
        expect(result[1].x).toBe(0);
        expect(result[2].x).toBe(400);
    });

    it('auto gap is 0 when only one child', () => {
        const entries = [
            { child: child(100, 50), width: 100, height: 50, isFlexibleMain: false },
        ];
        const result = layoutFlex(layoutInput({
            entries,
            rect: rect(500, 200),
            innerWidth: 500,
            innerHeight: 200,
            gap: 'auto',
            alignment: { x: -1, y: -1 },
        }));
        expect(result[0].x).toBe(-200);
    });
});

describe('layoutFlex – padding', () => {
    it('start in row pushes inwards by padding.left', () => {
        const entries = [
            { child: child(100, 50), width: 100, height: 50, isFlexibleMain: false },
        ];
        const result = layoutFlex(layoutInput({
            entries,
            rect: rect(500, 200),
            innerWidth: 480,
            innerHeight: 180,
            alignment: { x: -1, y: -1 },
            padding: { left: 20, right: 0, top: 0, bottom: 0 },
        }));
        // mainPos = -500/2 + 20 = -230, center = -230 + 50 = -180
        expect(result[0].x).toBe(-180);
    });

    it('end in row offsets by padding.right', () => {
        const entries = [
            { child: child(100, 50), width: 100, height: 50, isFlexibleMain: false },
        ];
        const result = layoutFlex(layoutInput({
            entries,
            rect: rect(500, 200),
            innerWidth: 480,
            innerHeight: 200,
            alignment: { x: 1, y: -1 },
            padding: { left: 0, right: 20, top: 0, bottom: 0 },
        }));
        // mainPos = 500/2 - 100 - 20 = 130, center = 130 + 50 = 180
        expect(result[0].x).toBe(180);
    });

    it('center in column shifts to the padded inner center for asymmetric padding', () => {
        const entries = [
            { child: child(100, 50), width: 100, height: 50, isFlexibleMain: false },
        ];
        const result = layoutFlex(layoutInput({
            direction: 'column',
            entries,
            rect: rect(500, 200),
            innerWidth: 200,
            innerHeight: 200,
            alignment: { x: 0, y: 0 },
            padding: { left: 50, right: 250, top: 0, bottom: 0 },
        }));
        // cross center honors padding asymmetry: (50 - 250) / 2 = -100
        expect(result[0].x).toBe(-100);
    });
});

describe('layoutFlex – column direction', () => {
    it('places first child top-aligned when alignment y=1', () => {
        const entries = [
            { child: child(50, 100), width: 50, height: 100, isFlexibleMain: false },
        ];
        const result = layoutFlex(layoutInput({
            direction: 'column',
            entries,
            rect: rect(200, 500),
            innerWidth: 200,
            innerHeight: 500,
            alignment: { x: 0, y: 1 },
        }));
        // column + alignment.y=1 is "start" → mainPos = -500/2 = -250, center = -250+50 = -200
        expect(result[0].y).toBe(-200);
        expect(result[0].x).toBe(0); // x=0 align center
    });

    it('respects gap when stacking column children', () => {
        const entries = [
            { child: child(50, 100), width: 50, height: 100, isFlexibleMain: false },
            { child: child(50, 80), width: 50, height: 80, isFlexibleMain: false },
        ];
        const result = layoutFlex(layoutInput({
            direction: 'column',
            entries,
            rect: rect(200, 500),
            innerWidth: 200,
            innerHeight: 500,
            gap: 30,
            alignment: { x: 0, y: 1 },
        }));
        // first center y = -250 + 50 = -200
        // mainPos after = -250 + 100 + 30 = -120, second center = -120 + 40 = -80
        expect(result[0].y).toBe(-200);
        expect(result[1].y).toBe(-80);
    });
});

describe('layoutFlex – returns sizes from entries', () => {
    it('width/height in the result come from the entry, not the rect', () => {
        const entries = [
            { child: child(100, 50), width: 100, height: 50, isFlexibleMain: false },
        ];
        const result = layoutFlex(layoutInput({
            entries,
            rect: rect(500, 200),
            innerWidth: 500,
            innerHeight: 200,
        }));
        expect(result[0].width).toBe(100);
        expect(result[0].height).toBe(50);
    });
});

// A fixed-size child carrying a per-child `gapScale`, for the animated
// insert/remove gap behavior. `gapScale` weights the flex gaps around this child.
function scaledChild(width: number, gapScale: number): FlexChild {
    return { ...child(width, 50), gapScale };
}

describe('measureFlex – gapScale (animated insert/remove gap budget)', () => {
    it('default gapScale of 1 reproduces the flat (count - 1) gap budget', () => {
        // 3 × 100, gap 20, all default weight → hug = 300 + 2×20 = 340 (unchanged).
        const result = measureFlex(
            [child(100, 50), child(100, 50), child(100, 50)],
            measureInput({ gap: 20 }),
        );
        expect(result.hugWidth).toBe(340);
    });

    it('a fractional-scale child opens a fractional gap in the hug size', () => {
        // Σ gapScale = 1 + 0.5 + 1 = 2.5 → totalGap = 20 × (2.5 − 1) = 30 → hug = 330.
        const result = measureFlex(
            [child(100, 50), scaledChild(100, 0.5), child(100, 50)],
            measureInput({ gap: 20 }),
        );
        expect(result.hugWidth).toBe(330);
    });

    it('a fully collapsed child removes exactly one gap from the budget', () => {
        // Σ gapScale = 1 + 0 + 1 = 2 → totalGap = 20 × (2 − 1) = 20 → hug = 320,
        // i.e. exactly one gap fewer than the fully-open 340.
        const result = measureFlex(
            [child(100, 50), scaledChild(100, 0), child(100, 50)],
            measureInput({ gap: 20 }),
        );
        expect(result.hugWidth).toBe(320);
    });

    it('a collapsed *edge* child also removes exactly one gap (position-independent)', () => {
        // Same Σ = 2 whether the 0-weight child is first, middle, or last.
        const first = measureFlex(
            [scaledChild(100, 0), child(100, 50), child(100, 50)],
            measureInput({ gap: 20 }),
        );
        const last = measureFlex(
            [child(100, 50), child(100, 50), scaledChild(100, 0)],
            measureInput({ gap: 20 }),
        );
        expect(first.hugWidth).toBe(320);
        expect(last.hugWidth).toBe(320);
    });

    it('clamps an over/undershooting scale to [0, 1] (guards eased-tween overshoot)', () => {
        // 1.5 clamps to 1, −0.3 clamps to 0 → Σ = 1 + 1 + 0 = 2 → totalGap = 20 → hug 320.
        const result = measureFlex(
            [scaledChild(100, 1.5), child(100, 50), scaledChild(100, -0.3)],
            measureInput({ gap: 20 }),
        );
        expect(result.hugWidth).toBe(320);
    });

    it('leaves fill children the right space as an inserted child grows', () => {
        // 500 inner, one 100 fixed + one fill, gap 20, fixed child at scale 0.5:
        // totalGap = 20 × (1.5 − 1) = 10 → fill gets 500 − 100 − 10 = 390.
        const result = measureFlex(
            [scaledChild(100, 0.5), child('fill', 50)],
            measureInput({ innerWidth: 500, gap: 20 }),
        );
        expect(result.entries[1].width).toBe(390);
    });
});

describe('layoutFlex – gapScale placement', () => {
    // Helper: 3 fixed 100-wide children in a 500-wide start-justified row, each
    // carrying a gapScale; returns the child centre x's.
    function centers(scales: [number, number, number]): number[] {
        const entries = scales.map((gapScale) => ({
            child: scaledChild(100, gapScale),
            width: 100,
            height: 50,
            isFlexibleMain: false,
            gapScale,
        }));
        return layoutFlex(layoutInput({
            entries,
            rect: rect(500, 200),
            innerWidth: 500,
            innerHeight: 200,
            gap: 20,
            alignment: { x: -1, y: -1 },
        })).map((b) => b.x);
    }

    it('all default weights place children exactly like a flat gap', () => {
        // -250 start: -200, then +100+20 → -80, then again → 40.
        expect(centers([1, 1, 1])).toEqual([-200, -80, 40]);
    });

    it('a half-scale middle child half-opens both its gaps', () => {
        // boundaryGap 0 = 20×(1+0.5)/2 = 15, boundaryGap 1 = 20×(0.5+1)/2 = 15.
        expect(centers([1, 0.5, 1])).toEqual([-200, -85, 30]);
    });

    it('a collapsed middle child pulls its right neighbour in by one full gap', () => {
        // Left child stays pinned; right side closes up by exactly one gap (20).
        expect(centers([1, 0, 1])).toEqual([-200, -90, 20]);
    });

    it('a collapsed leading child keeps the existing content edge pinned', () => {
        // startBias = -20×(1-0)/2 = -10 shifts the run left so the first *real*
        // child (index 1) sits where a 3-child row's first child would: -200.
        const entries = [
            { child: scaledChild(0, 0), width: 0, height: 50, isFlexibleMain: false, gapScale: 0 },
            { child: scaledChild(100, 1), width: 100, height: 50, isFlexibleMain: false, gapScale: 1 },
            { child: scaledChild(100, 1), width: 100, height: 50, isFlexibleMain: false, gapScale: 1 },
            { child: scaledChild(100, 1), width: 100, height: 50, isFlexibleMain: false, gapScale: 1 },
        ];
        const xs = layoutFlex(layoutInput({
            entries,
            rect: rect(500, 200),
            innerWidth: 500,
            innerHeight: 200,
            gap: 20,
            alignment: { x: -1, y: -1 },
        })).map((b) => b.x);
        // Existing tiles (indices 1..3) match the pre-insert 3-child layout.
        expect(xs.slice(1)).toEqual([-200, -80, 40]);
    });

    it('center justify stays centered with a collapsed child', () => {
        // totalMain = 300 + 20 = 320 → mainPos -160: -110, 0, 110 (symmetric).
        const entries = [1, 0, 1].map((gapScale) => ({
            child: scaledChild(100, gapScale),
            width: 100,
            height: 50,
            isFlexibleMain: false,
            gapScale,
        }));
        const xs = layoutFlex(layoutInput({
            entries,
            rect: rect(500, 200),
            innerWidth: 500,
            innerHeight: 200,
            gap: 20,
            alignment: { x: 0, y: 0 },
        })).map((b) => b.x);
        expect(xs).toEqual([-110, 0, 110]);
    });
});
