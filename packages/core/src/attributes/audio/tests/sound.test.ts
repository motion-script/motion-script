import { describe, it, expect } from 'vitest';
import { Sound } from '@/attributes/audio/sound';
import { AudioFilters } from '@/attributes/audio/filters/chain';
import { ramp } from '@/attributes/audio/filters/curve';
import { CanvasAssetTracker } from '@/assets/tracker';
import { ManifestAssetCatalog } from '@/assets/catalog';
import type { AssetManifest } from '@/assets/manifest';
import type { AudioRequest } from '@/attributes/audio/request';

const SRC = 'song.mp3';
const DURATION = 10;

function makeTracker(): CanvasAssetTracker {
    const manifest: AssetManifest = {
        image: {},
        video: {},
        audio: { [SRC]: { duration: DURATION, sizeBytes: 0, src: SRC } },
        font: {},
    };
    return new CanvasAssetTracker(new ManifestAssetCatalog(manifest));
}

/** Run a sound through start/stop at given times and read back its emitted request. */
function emit(sound: Sound, startTime: number, stopTime?: number): AudioRequest {
    sound.tick(startTime);
    sound.start();
    if (stopTime !== undefined) {
        sound.tick(stopTime);
        sound.stop();
    }
    const tracker = makeTracker();
    tracker.start(0);
    sound.prepare(tracker);
    tracker.end();
    return tracker.audioRequests[0];
}

describe('Sound filters', () => {
    it('carries resolved filters onto the emitted AudioRequest', () => {
        const sound = new Sound({ src: SRC, filters: AudioFilters.gain(2).lowpass(800), trimEnd: 4 });
        const req = emit(sound, 0, 4);
        expect(req.filters).toEqual([
            { type: 'gain', value: 2 },
            { type: 'lowpass', frequency: 800, q: undefined },
        ]);
    });

    it('omits filters when none are set', () => {
        const sound = new Sound({ src: SRC, trimEnd: 4 });
        const req = emit(sound, 0, 4);
        expect(req.filters).toBeUndefined();
    });
});

describe('Sound.effectiveSpeed', () => {
    it('defaults to 1 with no speed filter', () => {
        expect(new Sound({ src: SRC }).effectiveSpeed()).toBe(1);
    });

    it('returns the product of all speed filters', () => {
        expect(new Sound({ src: SRC, filters: AudioFilters.speed(2).speed(1.5) }).effectiveSpeed()).toBe(3);
    });

    it('ignores non-positive speeds', () => {
        expect(new Sound({ src: SRC, filters: AudioFilters.speed(0) }).effectiveSpeed()).toBe(1);
    });
});

describe('SpeedFilter timing', () => {
    it('shrinks endAt for a faster clip (explicit trimEnd)', () => {
        // 4s of source at 2x => 2s of scene time.
        const sound = new Sound({ src: SRC, filters: AudioFilters.speed(2), trimEnd: 4 });
        const req = emit(sound, 0);
        expect(req.endAt).toBeCloseTo(2);
    });

    it('grows endAt for a slower clip', () => {
        // 4s of source at 0.5x => 8s of scene time.
        const sound = new Sound({ src: SRC, filters: AudioFilters.speed(0.5), trimEnd: 4 });
        const req = emit(sound, 0);
        expect(req.endAt).toBeCloseTo(8);
    });

    it('emits an OPEN request carrying speed-adjusted media length for an unbounded clip', () => {
        // An untrimmed, un-stopped clip is now CROSS-SCENE: prepare() leaves it open
        // (endAt unresolved) and carries the speed-adjusted source length so
        // assembleTimeline can bound it against the project total. (Old behavior
        // pre-resolved endAt to fullLength/speed here.)
        const sound = new Sound({ src: SRC, filters: AudioFilters.speed(2) });
        const req = emit(sound, 0);
        expect(req.open).toBe(true);
        expect(req.endAt).toBe(Infinity);
        // 10s source at 2x => 5s of scene-time media length carried for resolution.
        expect(req.mediaDuration).toBeCloseTo(5);
    });

    it('leaves endAt unchanged at speed 1', () => {
        const sound = new Sound({ src: SRC, trimEnd: 4 });
        const req = emit(sound, 0);
        expect(req.endAt).toBeCloseTo(4);
    });

    it('integrates a speed CURVE to compute scene duration', () => {
        // Constant 2× expressed as a curve: 4s of source → 2s of scene time, same
        // as the scalar case but via the integral path.
        const sound = new Sound({ src: SRC, filters: AudioFilters.speed(ramp(2, 2, 4)), trimEnd: 4 });
        const req = emit(sound, 0);
        expect(req.endAt).toBeCloseTo(2, 1);
    });
});

describe('Sound open/cross-scene marking', () => {
    it('an untrimmed, un-stopped sound is open', () => {
        const sound = new Sound({ src: SRC });
        const req = emit(sound, 0);
        expect(req.open).toBe(true);
    });

    it('a started-then-STOPPED sound is bounded and NOT open', () => {
        // Regression: stopSound must end the clip; the open marker (set by an earlier
        // prepare pass while it was running) must be cleared so assembleTimeline does
        // not re-extend it across later scenes.
        const sound = new Sound({ src: SRC });
        const req = emit(sound, 0, 2); // start at 0, stop at 2
        expect(req.open).toBeFalsy();
        expect(req.mediaDuration).toBeUndefined();
        expect(req.endAt).toBeCloseTo(2);
    });

    it('stops are sticky even if prepare runs again afterward', () => {
        // Mimic the precomp loop: prepare() is called every frame. Once stopped, a
        // later prepare must not re-open the request.
        const sound = new Sound({ src: SRC });
        sound.tick(0); sound.start();
        sound.tick(2); sound.stop();
        const t = makeTracker();
        t.start(0); sound.prepare(t); sound.prepare(t); t.end();
        const req = t.audioRequests[0];
        expect(req.open).toBeFalsy();
        expect(req.endAt).toBeCloseTo(2);
    });
});

/**
 * How long a clip runs, in scene seconds.
 *
 * `play()` used to be a generator that blocked for exactly this long; a timeline
 * places the clip at a time and gives it a duration instead, so what remains
 * worth pinning is the length itself — and in particular that the speed profile
 * scales it.
 */
describe('Sound.clipDuration', () => {
    it('is the trimmed length at speed 1', () => {
        const sound = new Sound({ src: SRC, trimEnd: 4 });
        expect(sound.clipDuration).toBeCloseTo(4, 5);
    });

    it('is half as long at 2x speed', () => {
        const sound = new Sound({ src: SRC, filters: AudioFilters.speed(2), trimEnd: 4 });
        expect(sound.clipDuration).toBeCloseTo(2, 5);
    });

    it('is twice as long at 0.5x speed', () => {
        const sound = new Sound({ src: SRC, filters: AudioFilters.speed(0.5), trimEnd: 4 });
        expect(sound.clipDuration).toBeCloseTo(8, 5);
    });

    it('is undefined when the clip is unbounded', () => {
        // Nothing has resolved an out-point, so the clip runs until something
        // else stops it — a length no scene can know on its own.
        expect(new Sound({ src: SRC }).clipDuration).toBeUndefined();
    });
});
