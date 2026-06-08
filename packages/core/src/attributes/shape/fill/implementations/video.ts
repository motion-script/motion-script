import type { BlendMode } from '../blend';
import type { MediaFilter } from '../../filters/union';
import type { ImageFillMode, ImageTransform } from './image';


export interface VideoFillProp {
    type: 'video';
    src: string;
    mode?: ImageFillMode;
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
    mode?: ImageFillMode;
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

// export const videoFill: FillData<VideoFillResolved> = {
//     resolve: (prop: VideoFillProp) => ({ ...prop }),
//     lerp: (a, b, t) => ({
//         src: t < 0.5 ? a.src : b.src,
//         mode: a.mode ?? b.mode,
//         transform: a.transform ?? b.transform,
//         scaling: a.scaling ?? b.scaling,
//         loop: t < 0.5 ? a.loop : b.loop,
//         duration: t < 0.5 ? a.duration : b.duration,
//         trimStart: t < 0.5 ? a.trimStart : b.trimStart,
//         trimEnd: t < 0.5 ? a.trimEnd : b.trimEnd,
//         playing: t < 0.5 ? a.playing : b.playing,
//         opacity: (a.opacity ?? 1) + ((b.opacity ?? 1) - (a.opacity ?? 1)) * t,
//         timestamp: (a.timestamp ?? 0) + ((b.timestamp ?? 0) - (a.timestamp ?? 0)) * t,
//         speed: lerpNumber(a.speed ?? 1, b.speed ?? 1, t),
//     }),
//     update: (previous, globalTime, assets) => {
//         if (!previous.playing) return previous;
//         const start = previous.trimStart ?? 0;
//         const sourceDuration = assets.getVideoDuration(previous.src);
//         const end = previous.trimEnd ?? sourceDuration;
//         const speed = previous.speed ?? 1;
//         const loop = previous.loop ?? 'none';
//         const playStart = previous.playStart ?? globalTime;
//         const elapsed = (globalTime - playStart) * speed;
//         let newTimestamp: number;
//         const loopDuration = previous.duration ?? (end !== Infinity ? end - start : undefined);
//         if (loop !== 'none' && loopDuration !== undefined) {
//             const cycle = elapsed % loopDuration;
//             if (loop === 'reverse') {
//                 const ping = Math.floor(elapsed / loopDuration) % 2 === 0;
//                 newTimestamp = start + (ping ? cycle : loopDuration - cycle);
//             } else {
//                 newTimestamp = start + cycle;
//             }
//         } else {
//             newTimestamp = Math.min(start + elapsed, end);
//         }
//         return { ...previous, timestamp: newTimestamp, playStart };
//     },
//     equals: (a, b) => a.src === b.src,
//     dynamic: true,
//     prepare: (fill, manager, width, height) => {
//         manager.requestVideo(fill.src, width, height, fill.trimStart ?? 0, fill.trimEnd);
//     },
// };
