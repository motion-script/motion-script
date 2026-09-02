import {
    Rect,
    Scene,
    Text,
} from 'motion-script';
import { scene } from './_chain';

/**
 * Every e2e scene runs for the same fixed wall-clock duration so the screenshot
 * harness can address "first / mid / last" as deterministic frame indices
 * (0, floor(total/2), total-1) without probing each scene's length first.
 *
 * 2 seconds at the project's 30 fps == 60 frames. Authored scenes should fill
 * roughly this window (animate, then {@link hold} out the remainder) so the mid
 * frame lands somewhere visually interesting rather than on a static pose.
 */
export const SCENE_SECONDS = 2;

/**
 * Pad the tail of a scene so its total runtime is exactly {@link SCENE_SECONDS}.
 *
 * A number, because a chain step that is a number is a hold — see `_chain.ts`.
 * Clamped at zero so a scene that already fills the window adds nothing.
 */
export function holdTail(usedSeconds: number): number {
    return Math.max(0, SCENE_SECONDS - usedSeconds);
}

/**
 * Placeholder generator for a not-yet-authored checkbox. Renders the scene id
 * centered on the standard background so the screenshot pipeline still produces
 * a valid, uniquely-identifiable frame for every TESTS.md entry — a stub scene
 * is a *passing* scene (stable and lib render the same placeholder), it just
 * doesn't exercise the feature yet. Replace the file with a real scene to cover
 * the checkbox.
 */
export const placeholder = (id: string): Scene =>
    scene((stage) => {
        stage.set({ fill: '#11141b' });
        stage.add(
            <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
                <Rect
                    width={820}
                    height={120}
                    fill={'#1b2030'}
                    stroke={{ weight: 2, fill: '#2c3344' }}
                    cornerRadius={16}
                    flow={'freeform'}
                    align={{ x: 0, y: 0 }}
                >
                    <Text
                        text={id}
                        fontFamily={'Inter'}
                        fontSize={40}
                        fill={'#9aa4bf'}
                        width={'fill'}
                        textAlign={'center'}
                    />
                </Rect>
            </Rect>,
        );
    }, [holdTail(0)]);
