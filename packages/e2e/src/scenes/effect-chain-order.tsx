import { createScene, Rect, Image, Text, Effects } from 'motion-script';
import { holdTail } from './_lib';

/**
 * Regression guard: a chain of shader effects must run in **author order**.
 *
 * The two cards carry the same two effects in opposite orders, and the result
 * is unambiguous because each effect destroys what the other would have shown:
 *
 * - left  — `bitCrush` then `threshold`: greens get cut to pure black and white.
 * - right — `threshold` then `bitCrush`: black and white snap to the two extreme
 *   greens of the DMG palette.
 *
 * If the chain ever runs backwards again the two cards swap, which no threshold
 * tuning can disguise. (They rendered identically before the fix, because
 * whichever effect ran last dictated the output.)
 */
const crush = { palette: 'gameboy' as const, amount: 1 };

export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'row'} gap={40} padding={60} align={{ x: 0, y: 0 }}>
            <Rect width={'fill'} height={'fill'} group={'column'} gap={16}>
                <Rect width={'fill'} height={'fill'} cornerRadius={16} clip={true} group={'stack'}>
                    <Image
                        src={'./cat.jpg'}
                        fit={'fill'}
                        width={'fill'}
                        height={'fill'}
                        effects={Effects.bitCrush(crush).threshold({ level: 0.4, smoothness: 0.02 })}
                    />
                </Rect>
                <Text text={'crush → threshold'} fontFamily={'Inter'} fontSize={22} fill={'#9aa4bf'} />
            </Rect>
            <Rect width={'fill'} height={'fill'} group={'column'} gap={16}>
                <Rect width={'fill'} height={'fill'} cornerRadius={16} clip={true} group={'stack'}>
                    <Image
                        src={'./cat.jpg'}
                        fit={'fill'}
                        width={'fill'}
                        height={'fill'}
                        effects={Effects.threshold({ level: 0.4, smoothness: 0.02 }).bitCrush(crush)}
                    />
                </Rect>
                <Text text={'threshold → crush'} fontFamily={'Inter'} fontSize={22} fill={'#9aa4bf'} />
            </Rect>
        </Rect>,
    );

    yield* holdTail(0);
});
