/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Text, Rect, AFX, easeInOutQuad, easeOutQuad, wait } from "@motion-script/core";

/**
 * `this.startSound(...)` / `this.stopSound(...)` — the non-blocking form. The
 * sound runs in the background on the audio timeline while the scene keeps
 * animating; we hold a handle and stop it explicitly partway through.
 */
export class StartStopSoundScene extends Scene {
    *build() {
        this.set({ fill: 'bg', padding: 80, group: 'column', gap: 40 });

        const dot = createRef<Rect>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} gap={40}>
                <Text fontFamily={'Pixelify Sans'} text={'startSound / stopSound'} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={300} fill={'card'} cornerRadius={16} group={'row'} alignment={{ x: 0, y: 0 }}>
                    <Rect ref={dot} width={120} height={120} fill={'primary'} cornerRadius={60} />
                </Rect>
            </Rect>
        );

        // Kick the sound off in the background, keep its handle.
        const handle = this.startSound('song.mp3', { volume: 0.9, filters: AFX.echo(0.25, 0.4, 0.4) });

        // Animate while it plays — startSound doesn't block.
        yield* dot().to({ scale: 1.6, fill: '#e8c84a' } as any, 1.2, easeInOutQuad);
        yield* dot().to({ scale: 1, fill: 'primary' } as any, 1.2, easeInOutQuad);

        // Stop the sound explicitly, then let the visual settle.
        this.stopSound(handle);
        yield* dot().to({ scale: 0.6, fill: '#e0664a' } as any, 0.5, easeOutQuad);
        yield* wait(0.6);
    }
}
