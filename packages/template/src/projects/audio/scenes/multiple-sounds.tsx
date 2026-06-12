/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Text, Rect, AFX, easeInOutQuad, parallel, wait } from "@motion-script/core";

/**
 * Two clips playing at once. `startSound` layers a looping bed (`song.mp3`)
 * under a one-shot `glitch.mp3` played via the blocking `playSound`; the audio
 * timeline mixes them together. Each gets its own filter chain.
 */
export class MultipleSoundsScene extends Scene {
    *build() {
        this.set({ fill: 'bg', padding: 80, group: 'column', gap: 40 });

        const bed = createRef<Rect>();
        const shot = createRef<Rect>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} gap={40}>
                <Text fontFamily={'Pixelify Sans'} text={'Two sounds at once'} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} group={'column'} gap={24} alignment={{ x: 0, y: 0 }}>
                    <Rect width={'fill'} height={100} fill={'card'} borderRadius={16} padding={16} group={'row'} alignment={{ x: -1, y: 0 }}>
                        <Rect ref={bed} width={40} height={'fill'} fill={'primary'} borderRadius={8} />
                    </Rect>
                    <Rect width={'fill'} height={100} fill={'card'} borderRadius={16} padding={16} group={'row'} alignment={{ x: -1, y: 0 }}>
                        <Rect ref={shot} width={40} height={'fill'} fill={'#e0664a'} borderRadius={8} />
                    </Rect>
                </Rect>
            </Rect>
        );

        // A quieter, low-passed bed running underneath the whole scene.
        const bedHandle = this.startSound('song.mp3', { volume: 0.5, filters: AFX.lowpass(900) });

        // Both bars sweep together; the glitch one-shot plays over the bed.
        yield* parallel(
            this.playSound('glitch.mp3', { volume: 1, filters: AFX.gain(1.2) }),
            bed().to({ width: 'fill' } as any, 4, easeInOutQuad),
            shot().to({ width: 'fill' } as any, 4, easeInOutQuad),
        );

        this.stopSound(bedHandle);
        yield* wait(0.4);
    }
}
