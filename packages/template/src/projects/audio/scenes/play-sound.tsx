/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Text, Rect, AFX, easeInOutQuad, parallel, wait } from "@motion-script/core";

/**
 * `yield* this.playSound(...)` — the blocking form. The generator pauses for the
 * clip's duration, then resumes, so the timeline naturally waits for the sound
 * to finish before the next step runs.
 */
export class PlaySoundScene extends Scene {
    *build() {
        this.set({ fill: 'bg', padding: 80, group: 'column', gap: 40 });

        const bar = createRef<Rect>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} gap={40}>
                <Text fontFamily={'Pixelify Sans'} text={'yield* playSound (blocking)'} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={120} fill={'card'} borderRadius={16} padding={16} group={'row'} alignment={{ x: -1, y: 0 }}>
                    <Rect ref={bar} width={40} height={'fill'} fill={'primary'} borderRadius={8} />
                </Rect>
            </Rect>
        );

        // The sweep runs alongside the blocking sound; both finish together.
        yield* parallel(
            this.playSound('song.mp3', { duration: 4, filters: AFX.lowpass(1200) }),
            bar().to({ width: 'fill' } as any, 4, easeInOutQuad),
        );

        // Because playSound blocked, control only reaches here once the clip ended.
        yield* parallel(
            bar().to({ fill: '#6bcc8a' } as any, 0.4),
        );
        yield* wait(0.6);
    }
}
