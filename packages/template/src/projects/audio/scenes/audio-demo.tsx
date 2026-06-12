/** @jsxImportSource @motion-script/core/jsx */

import {
    Scene, createRef, Text, Rect,
    ChainableAfx, easeInOutQuad, parallel, wait,
} from "@motion-script/core";

/**
 * Shared scaffolding for the per-filter audio showcase scenes.
 *
 * Audio is invisible, so each demo pairs a labelled card with a simple bar that
 * sweeps across while the clip plays — giving the eye something to track and a
 * visible sense of the clip's length (which a `speed` filter changes). Subclasses
 * declare the clip via {@link AudioDemoScene.spec}; this base plays it through
 * {@link Scene.playSound} and runs the sweep in parallel.
 */
export interface AudioDemoSpec {
    /** Card heading naming the active filter. */
    label: string;
    /** Audio file to play. Defaults to `song.mp3`. */
    src?: string;
    /** Filter chain to apply. Omit for the unfiltered reference clip. */
    filters?: ChainableAfx;
    /** Seconds of source audio to play (before any speed retiming). Default 4. */
    clip?: number;
}

export abstract class AudioDemoScene extends Scene {
    /** Declared by each concrete demo scene. */
    abstract readonly spec: AudioDemoSpec;

    *build() {
        this.set({ fill: 'bg', padding: 80, group: 'column', gap: 40 });

        const { label, src = 'song.mp3', filters, clip = 4 } = this.spec;

        const bar = createRef<Rect>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} gap={40}>
                <Text
                    fontFamily={'Pixelify Sans'}
                    text={label}
                    fontSize={96}
                    fill={'gray'}
                    width={'fill'}
                    align={'start'}
                />
                {/* Track the bar sweeps across. */}
                <Rect width={'fill'} height={120} fill={'card'} borderRadius={16} padding={16} group={'row'} alignment={{ x: -1, y: 0 }}>
                    <Rect ref={bar} width={40} height={'fill'} fill={'primary'} borderRadius={8} />
                </Rect>
            </Rect>
        );

        // The bar sweep lasts exactly as long as the clip occupies the timeline,
        // so a sped-up clip visibly finishes sooner and a slowed one lingers.
        // playSound() already divides by the speed multiplier for us.
        yield* parallel(
            this.playSound(src, { duration: clip, filters }),
            bar().to({ width: 'fill' } as any, this.estimateLength(clip), easeInOutQuad),
        );
        yield* wait(0.4);
    }

    /** Scene-time length of the clip, accounting for any speed filter. */
    private estimateLength(clip: number): number {
        const filters = this.spec.filters;
        if (!filters) return clip;
        const list = Array.isArray(filters) ? filters : [...(filters as Iterable<any>)];
        let speed = 1;
        for (const f of list) if (f.type === 'speed' && f.value > 0) speed *= f.value;
        return clip / speed;
    }
}
