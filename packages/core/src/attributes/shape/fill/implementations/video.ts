import type { BlendMode } from '../blend';
import type { MediaFilter } from '../../filters/union';
import type { FillData } from '../registry';
import type { ImageFit, ImageTransform } from './image';
import { lerpNumber } from '@/tween/lerp';


export interface VideoFillProp {
    type: 'video';
    src: string;
    mode?: ImageFit;
    transform?: ImageTransform;
    scaling?: number;
    timestamp: number;
    playing: boolean;
    trimStart?: number;
    trimEnd?: number;
    speed?: number;
    filters?: MediaFilter[];
    loop?: 'forward' | 'reverse' | 'none';
    duration?: number;
    opacity?: number;
    blend?: BlendMode;
}

export interface VideoFillResolved {
    type: 'video';
    src: string;
    mode?: ImageFit;
    transform?: ImageTransform;
    scaling?: number;
    timestamp: number;
    playing: boolean;
    trimStart?: number;
    trimEnd?: number;
    playStart?: number;
    speed?: number;
    filters?: MediaFilter[];
    loop?: 'forward' | 'reverse' | 'none';
    duration?: number;
    opacity?: number;
    blend?: BlendMode;
}

export const videoFill: FillData<VideoFillResolved> = {
    resolve: (prop: VideoFillProp) => ({ ...prop }),
    lerp: (a, b, t) => ({
        src: t < 0.5 ? a.src : b.src,
        mode: a.mode ?? b.mode,
        transform: a.transform ?? b.transform,
        scaling: a.scaling ?? b.scaling,
        loop: t < 0.5 ? a.loop : b.loop,
        duration: t < 0.5 ? a.duration : b.duration,
        trimStart: t < 0.5 ? a.trimStart : b.trimStart,
        trimEnd: t < 0.5 ? a.trimEnd : b.trimEnd,
        playStart: t < 0.5 ? a.playStart : b.playStart,
        playing: t < 0.5 ? a.playing : b.playing,
        opacity: (a.opacity ?? 1) + ((b.opacity ?? 1) - (a.opacity ?? 1)) * t,
        timestamp: (a.timestamp ?? 0) + ((b.timestamp ?? 0) - (a.timestamp ?? 0)) * t,
        speed: lerpNumber(a.speed ?? 1, b.speed ?? 1, t),
    }),
    update: (previous, globalTime, assets) => {
        if (!previous.playing) return previous;
        const start = previous.trimStart ?? 0;
        // The build-time manifest may not know the source duration (some probes
        // can't read it from the container), in which case getVideoDuration is 0.
        // Treat a non-positive duration as "unknown" and play linearly — the web
        // adapter clamps to the real, decoded duration. This also avoids a `% 0`
        // (which is NaN) in the loop branch below.
        const sourceDuration = assets.getVideoDuration(previous.src);
        const hasDuration = Number.isFinite(sourceDuration) && sourceDuration > 0;
        const end = previous.trimEnd ?? (hasDuration ? sourceDuration : Infinity);
        const speed = previous.speed ?? 1;
        const loop = previous.loop ?? 'none';
        const playStart = previous.playStart ?? globalTime;
        const elapsed = (globalTime - playStart) * speed;
        let newTimestamp: number;
        const rawLoopDuration = previous.duration ?? (end !== Infinity ? end - start : undefined);
        const loopDuration = rawLoopDuration !== undefined && rawLoopDuration > 0 ? rawLoopDuration : undefined;
        if (loop !== 'none' && loopDuration !== undefined) {
            const cycle = elapsed % loopDuration;
            if (loop === 'reverse') {
                const ping = Math.floor(elapsed / loopDuration) % 2 === 0;
                newTimestamp = start + (ping ? cycle : loopDuration - cycle);
            } else {
                newTimestamp = start + cycle;
            }
        } else {
            newTimestamp = start + elapsed;
            if (end !== Infinity) newTimestamp = Math.min(newTimestamp, end);
        }
        return { ...previous, timestamp: newTimestamp, playStart };
    },
    equals: (a, b) => a.src === b.src,
    dynamic: true,
    prepare: (fill, manager, width, height) => {
        manager.requestVideo(fill.src, width, height, fill.trimStart ?? 0, fill.trimEnd);
    },
};
