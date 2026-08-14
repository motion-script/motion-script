import {
    createScene, createRef, Reference, Rect, Text, Fills, FractalNoiseBasis,
    easeInOut, parallel,
} from "motion-script";

const STAGE = '#0D0F15';
const HEADING = '#C9D2E4';

/** One card per basis — the four produce genuinely different structure, not four tunings of one look. */
const BASES: { basis: FractalNoiseBasis; label: string; colors: string[] }[] = [
    { basis: 'value', label: 'value — cloud', colors: ['#10131b', '#6990DD'] },
    { basis: 'simplex', label: 'simplex — smoke', colors: ['#0D0F15', '#E8617C'] },
    { basis: 'ridged', label: 'ridged — marble', colors: ['#1a1206', '#F5C26B'] },
    { basis: 'worley', label: 'worley — cells', colors: ['#04140f', '#7FD1C1'] },
];

/**
 * The fractal-noise fill across its four bases, panning through the field.
 *
 * `offset` is what travels *through* the noise, so the pattern flows rather than
 * churning — tweening `seed` instead would swap to an unrelated field each frame.
 * That distinction is the whole reason both knobs exist.
 */
export default createScene(function* (stage) {
    stage.set({ fill: STAGE });

    const cards: Reference<Rect>[] = BASES.map(() => createRef<Rect>());

    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={64} gap={28}>
            <Text text={'Fractal noise'} fontSize={44} fill={HEADING} width={'fill'} textAlign={'center'} />
            <Rect width={'fill'} height={'fill'} flow={'horizontal'} gap={28}>
                {BASES.map(({ basis, label, colors }, i) => (
                    <Rect width={'fill'} height={'fill'} flow={'vertical'} gap={12}>
                        <Rect
                            ref={cards[i]}
                            width={'fill'}
                            height={'fill'}
                            cornerRadius={16}
                            clip={true}
                            fill={Fills.fractalNoise({
                                basis,
                                octaves: basis === 'worley' ? 3 : 5,
                                frequency: basis === 'worley' ? 5 : 3,
                                colors,
                            })}
                        />
                        <Text text={label} fontSize={26} fill={HEADING} width={'fill'} textAlign={'center'} />
                    </Rect>
                ))}
            </Rect>
        </Rect>
    );

    yield* parallel(...cards.map((card, i) =>
        card().to({
            fill: Fills.fractalNoise({
                basis: BASES[i].basis,
                octaves: BASES[i].basis === 'worley' ? 3 : 5,
                frequency: BASES[i].basis === 'worley' ? 5 : 3,
                colors: BASES[i].colors,
                offset: { x: 2.5, y: 1.2 },
            }),
        }, 3, easeInOut('quad'))
    ));
});
