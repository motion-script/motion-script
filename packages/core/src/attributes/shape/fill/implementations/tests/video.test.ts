import { describe, it, expect } from 'vitest';
import { resolveFill, lerpFill } from '@/attributes/shape/fill/registry';
import { resolveVideoTimestamp } from '@/attributes/shape/fill/implementations/video';
import type { VideoFillProp, VideoFillResolved } from '@/attributes/shape/fill/implementations/video';

const SRC = 'clip.mp4';
/** The clip's real length — what the backend reads off the decoded container. */
const DURATION = 10;

function video(prop: Partial<VideoFillProp> = {}): VideoFillResolved {
    return resolveFill({ type: 'video', src: SRC, ...prop } as VideoFillProp) as VideoFillResolved;
}

describe('resolveVideoTimestamp', () => {
    it('derives the source time from how long the painting node has existed', () => {
        const fill = video();
        expect(resolveVideoTimestamp(fill, 0, DURATION)).toBe(0);
        expect(resolveVideoTimestamp(fill, 2.5, DURATION)).toBe(2.5);
    });

    it('is a pure function of elapsed — a frame revisited resolves identically', () => {
        const fill = video();
        const forward = [0, 1, 2, 3].map(t => resolveVideoTimestamp(fill, t, DURATION));
        const scrubbed = [3, 2, 1, 0].map(t => resolveVideoTimestamp(fill, t, DURATION)).reverse();
        expect(scrubbed).toEqual(forward);
    });

    it('honours an explicit timestamp over the clock', () => {
        const fill = video({ timestamp: 4 });
        expect(resolveVideoTimestamp(fill, 0, DURATION)).toBe(4);
        expect(resolveVideoTimestamp(fill, 7, DURATION)).toBe(4);
    });

    it('treats a null timestamp as derived — the way an override is handed back', () => {
        // `Node2D.set` merges a partial and skips `undefined`, so `null` is what
        // un-does a live override.
        expect(resolveVideoTimestamp(video({ timestamp: null }), 3, DURATION)).toBe(3);
    });

    it('holds the first frame while paused, and the authored one when both are given', () => {
        expect(resolveVideoTimestamp(video({ playing: false }), 3, DURATION)).toBe(0);
        expect(resolveVideoTimestamp(video({ playing: false, trimStart: 2 }), 3, DURATION)).toBe(2);
        expect(resolveVideoTimestamp(video({ playing: false, timestamp: 6 }), 3, DURATION)).toBe(6);
    });

    it('plays from trimStart at the given speed', () => {
        const fill = video({ trimStart: 2, speed: 2 });
        expect(resolveVideoTimestamp(fill, 0, DURATION)).toBe(2);
        expect(resolveVideoTimestamp(fill, 1.5, DURATION)).toBe(5);
    });

    it('delays playback by playStart, and starts mid-clip for a negative one', () => {
        expect(resolveVideoTimestamp(video({ playStart: 2 }), 1, DURATION)).toBe(0);
        expect(resolveVideoTimestamp(video({ playStart: 2 }), 3.5, DURATION)).toBe(1.5);
        expect(resolveVideoTimestamp(video({ playStart: -4 }), 1, DURATION)).toBe(5);
    });

    it('clamps at trimEnd, falling back to the source duration', () => {
        expect(resolveVideoTimestamp(video({ trimEnd: 4 }), 9, DURATION)).toBe(4);
        expect(resolveVideoTimestamp(video(), 99, DURATION)).toBe(DURATION);
    });

    it('plays linearly and unlooped when the duration is unknown', () => {
        // The decoder clamps to the real length once the container is open; an
        // unknown duration must not produce a `% 0` NaN in the loop branch.
        expect(resolveVideoTimestamp(video(), 42)).toBe(42);
        expect(resolveVideoTimestamp(video({ loop: 'forward' }), 42, 0)).toBe(42);
    });

    it('wraps a forward loop over the trimmed length', () => {
        const fill = video({ loop: 'forward', trimStart: 1, trimEnd: 4 });
        expect(resolveVideoTimestamp(fill, 2, DURATION)).toBe(3);
        expect(resolveVideoTimestamp(fill, 4, DURATION)).toBe(2); // one cycle on
    });

    it('ping-pongs a reverse loop', () => {
        const fill = video({ loop: 'reverse', trimEnd: 4 });
        expect(resolveVideoTimestamp(fill, 1, DURATION)).toBe(1);   // first pass, forward
        expect(resolveVideoTimestamp(fill, 5, DURATION)).toBe(3);   // second pass, backward
    });

    it('takes an explicit loop duration over the trimmed length', () => {
        const fill = video({ loop: 'forward', duration: 2 });
        expect(resolveVideoTimestamp(fill, 5, DURATION)).toBe(1);
    });

    it('quantizes to the posterizeTime grid, in source-time space', () => {
        const fill = video({ trimStart: 1, filters: [{ type: 'posterizeTime', fps: 4 }] });
        // 1.6s into the clip snaps back to the 0.25s grid measured from trimStart.
        expect(resolveVideoTimestamp(fill, 0.6, DURATION)).toBeCloseTo(1.5);
    });
});

describe('videoFill.resolve / lerp', () => {
    it('leaves the timestamp derived and plays by default', () => {
        const fill = video();
        expect(fill.timestamp).toBeUndefined();
        expect(fill.playing).toBe(true);
    });

    it('keeps a tween between two derived fills derived', () => {
        // Pinning it to a number here would freeze the clip for the tween's life.
        const mid = lerpFill(video(), video({ opacity: 0.5 }), 0.5) as VideoFillResolved;
        expect(mid.timestamp).toBeUndefined();
        expect(resolveVideoTimestamp(mid, 3, DURATION)).toBe(3);
    });

    it('interpolates when either side is explicit', () => {
        const mid = lerpFill(video({ timestamp: 0 }), video({ timestamp: 4 }), 0.5) as VideoFillResolved;
        expect(mid.timestamp).toBe(2);
    });
});
