
import {
    Scene,
    createRef,
    Text,
    Rect,
    wait,
    parallel,
    easeOutQuart,
    easeOutQuad,

    tween,
    FX
} from "@motion-script/core";

const CREAM = '#F5ECD7';
const COPPER = '#C07840';
const GHOST_COLOR = '#c2845d'; // cream with an orange tint
const BASE_FONT_SIZE = 260;

// Generates ghost layer config: count layers linearly interpolated from
// BASE_FONT_SIZE up to BASE_FONT_SIZE * scale, with ascending opacity.
function buildGhosts(count: number, scale: number) {
    return Array.from({ length: count }, (_, i) => {
        const t = count === 1 ? 1 : i / (count - 1);
        return {
            fontSize: Math.round(BASE_FONT_SIZE * (1 + t * (scale - 1))),
            opacity: 0.04,
        };
    });
}

/**
 * Reusable generator function to smoothly increment text numbers over time.
 */
export function* incrementText(
    textNode: Text,
    start: number,
    end: number,
    duration: number,
    padLength: number = 3,
    timingFunc: (t: number) => number = easeOutQuad
) {
    yield* tween(duration, (value) => {
        const progress = timingFunc(value);
        const current = Math.round(start + (end - start) * progress);
        textNode.set({ text: String(current).padStart(padLength, '0') });
    });
}

export class NumberScene extends Scene {
    *build() {
        this.set({ fill: '#0f0e0d' });

        const GHOSTS = buildGhosts(8, 1.8);

        const mainNumber = createRef<Text>();
        const pagesLabel = createRef<Text>();
        const ghostRefs = GHOSTS.map(() => createRef<Text>());

        for (let i = 0; i < GHOSTS.length; i++) {
            this.add(
                <Text
                    ref={ghostRefs[i]}
                    text={'244'}
                    fontSize={GHOSTS[i].fontSize}
                    y={30}
                    effects={FX.blur(2)}
                    fontWeight={700}
                    fill={GHOST_COLOR}
                    opacity={0}
                    align={'center'}
                />
            );
        }

        this.add(
            <Rect group={'column'} gap={0}>
                <Text
                    ref={mainNumber}
                    text={'000'}
                    fontSize={BASE_FONT_SIZE}
                    fontWeight={800}
                    fill={CREAM}
                    align={'center'}
                />
                <Text
                    ref={pagesLabel}
                    text={'COMMITS'}
                    fontSize={52}
                    fontWeight={700}
                    fill={GHOST_COLOR}
                    letterSpacing={12}
                    align={'center'}
                    opacity={0}
                    y={30}
                />
            </Rect>
        );

        yield* wait(0.3);

        // Smoothly animate the text using the extracted tween function
        yield* incrementText(mainNumber(), 0, 244, 2.5, 3, easeOutQuad);

        yield* wait(0.1);

        yield* parallel(
            pagesLabel().to({ opacity: 1, y: 0 }, 0.6, easeOutQuad),
            ...ghostRefs.map((ref, i) =>
                ref().to({ opacity: GHOSTS[i].opacity }, 0.2 + i * 0.01)
            ),
        );

        yield* wait(1.5);
    }
}