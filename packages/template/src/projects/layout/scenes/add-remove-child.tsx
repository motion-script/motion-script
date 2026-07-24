

import { createScene, createRef, Rect, Reference, easeInOut, wait, Text } from "motion-script";
import { layoutCard, tile } from "./layout-card";

/**
 * Demonstrates the animated overloads of `addChildAt`/`removeChildAt`: pass a
 * duration (and optional easing) and the child grows/shrinks in place instead
 * of popping, with siblings sliding over to open or close the gap.
 *
 * The row uses a non-zero `gap` on purpose: the animated helpers tween the
 * child's per-child `gapScale` alongside its box, so the flanking gap opens and
 * closes *continuously* with the size — no jump-cut of one whole gap the instant
 * the child attaches/detaches.
 *
 * Run three times against the same row — insert-at-start, insert-at-end, and
 * insert-in-the-middle — then reverse each with a matching animated remove, so
 * both directions (grow-in / shrink-out) are visible at every position a child
 * can occupy: the two ends and the middle.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const row = createRef<Rect>();
    const base = [createRef<Rect>(), createRef<Rect>(), createRef<Rect>()];
    const baseColors = ['#6990DD', '#E8617C', '#F5C26B'];

    stage.add(
        layoutCard({
            label: 'animated addChildAt / removeChildAt',
            stage: 'stack',
            children: (
                <Rect ref={row} width={'hug'} height={'fill'} group={'row'} gap={24} align={'centerLeft'}>
                    {base.map((ref, i) => tile({ ref, color: baseColors[i], width: 200, height: 200, label: `${i + 1}` }))}
                </Rect>
            ),
        })
    );

    const DURATION = 0.8;
    const EASE = easeInOut('quad');

    // A newcomer tile to insert; `ref` lets us drive its removal afterwards.
    const newcomer = (color: string, label: string, ref: Reference<Rect>) =>
        tile({ ref, color, width: 200, height: 200, label });

    // --- Insert at the start, then remove it again -------------------------
    const first = createRef<Rect>();
    yield* wait(0.3);
    yield* row().addChildAt(newcomer('#8CD9B3', 'S', first), 0, DURATION, EASE);
    yield* wait(0.5);
    yield* row().removeChildAt(0, DURATION, EASE);

    // --- Insert in the middle, then remove it again -------------------------
    const middle = createRef<Rect>();
    yield* wait(0.3);
    // `base` still occupies indices 0-2; inserting at 2 lands between tiles "2" and "3".
    yield* row().addChildAt(newcomer('#C792EA', 'M', middle), 2, DURATION, EASE);
    yield* wait(0.5);
    yield* row().removeChildAt(2, DURATION, EASE);

    // --- Insert at the end, then remove it again -------------------------
    const last = createRef<Rect>();
    yield* wait(0.3);
    yield* row().addChildAt(newcomer('#F58A8A', 'E', last), row().children.length, DURATION, EASE);
    yield* wait(0.5);
    yield* row().removeChildAt(row().children.length - 1, DURATION, EASE);
    yield* row().addChildAt(<Text text="New Text" fontSize={40} fill="white" />, row().children.length, DURATION, EASE);

    yield* wait(0.4);
});
