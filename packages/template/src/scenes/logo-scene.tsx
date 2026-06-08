import {
    Scene,
    createRef,
    wait,
    parallel,
    Rect,
    Fill,
    FX,
    Text,
    easeOutQuad,
    easeInQuad,
    easeOutBack,
} from "@motion-script/core";

export class LogoScene extends Scene {
    *build() {
        this.set({
            fill: [
                'bg',
                Fill.image('paper.png', { opacity: 0.2, blend: 'overlay', mode: 'fill' }),
                Fill.image('halftone.jpg', { opacity: 0.2, blend: 'overlay', mode: 'fill' }),
            ],
            group: 'column',

        });

        const title = createRef<Rect>();
        const wheel = createRef<Text>();

        // How far the subtitle travels through focus on each turn, plus its
        // dim/blur extremes. (y positive = up.)
        const TRAVEL = 70;           // px each phrase rises through focus
        const ENTER_FROM = -TRAVEL;  // start below the focus line
        const EXIT_TO = TRAVEL;      // leave above the focus line
        const BLUR = 12;             // out-of-focus blur radius

        const phrases = [
            'Layouts',
            'Shaders',
            'Code',
            'Animation, done right.',
        ];

        this.add(
            <>
                {/* Title — starts hidden, dropped down and slightly small. */}
                <Rect
                    ref={title}
                    group={'column'}
                    gap={20}
                    padding={32}
                    opacity={0}
                    y={-60}
                    scale={0.92}
                    effects={FX.chromaticAberration(0, 0).blur(20)}
                >
                    <Rect width={1000} height={160} fill={Fill.image('logo-title.png', { mode: 'fit' })} />
                </Rect>

                {/* Subtitle slot — fixed-height so the title above stays put while
                    the wheel scrolls phrases through this band. */}
                <Rect width={'hug'} height={40}>
                    <Text
                        ref={wheel}
                        text={phrases[0]}
                        fontSize={54}
                        fontWeight={500}
                        letterSpacing={2}
                        fill={'#a2a3a6'}
                        opacity={0}
                        y={ENTER_FROM}
                        fontFamily={'Pixelify Sans'}
                        effects={FX.blur(BLUR)}
                    />
                </Rect>
            </>,
        );

        // --- Sleek title intro: rise, settle, and bloom into view. -------------
        yield* parallel(
            title().to({ opacity: 1, effects: FX.chromaticAberration(0, 0).blur(0) }, 0.7, easeOutQuad),
            title().to({ y: 0, scale: 1 }, 0.9, easeOutBack(1.2)),
        );
        yield* wait(0.4);

        // --- Vertical wheel on the subtitle: reveal each phrase sequentially. --
        // The title holds in place. For each phrase: slide up + fade in + sharpen
        // into focus, hold, then slide up + fade out + blur away — seamlessly
        // handing off to the next.
        for (let i = 0; i < phrases.length; i++) {
            const isLast = i === phrases.length - 1;

            // Settle the current phrase into focus from below.
            yield* parallel(
                wheel().to({ y: 0 }, 0.4, easeOutQuad),
                wheel().to({ opacity: isLast ? 1 : 0.6 }, 0.35, easeOutQuad),
                wheel().to({ effects: FX.blur(0) }, 0.55, easeOutQuad),
            );

            // The final phrase stays on screen — glitch it instead of carrying
            // it away.
            if (isLast) break;

            yield* wait(0.2);

            // Carry it up and out of focus.
            yield* parallel(
                wheel().to({ y: EXIT_TO }, 0.55, easeInQuad),
                wheel().to({ opacity: 0 }, 0.45, easeInQuad),
                wheel().to({ effects: FX.blur(BLUR) }, 0.55, easeInQuad),
            );

            // Swap in the next phrase and snap back below the focus line.
            const next = phrases[(i + 1) % phrases.length];
            wheel().set({ text: next, y: ENTER_FROM });
        }
        const glitch = this.startSound('glitch.mp3');


        // --- Glitch finale on the lingering title + subtitle. ------------------
        // A quick, subtle chromatic split: slam in, settle, then snap clean.
        yield* parallel(
            title().to({ effects: FX.chromaticAberration(8, 0) }, 0.05),
            wheel().to({ effects: FX.chromaticAberration(8, 0) }, 0.05),
        );
        yield* parallel(
            title().to({ effects: FX.chromaticAberration(2, 0) }, 0.12, easeOutQuad),
            wheel().to({ effects: FX.chromaticAberration(2, 0) }, 0.12, easeOutQuad),
        );
        yield* parallel(
            title().to({ effects: FX.chromaticAberration(0, 0) }, 0.1, easeOutQuad),
            wheel().to({ effects: FX.chromaticAberration(0, 0) }, 0.1, easeOutQuad),
        );
        this.stopSound(glitch);

        yield* wait(1);
    }
};
