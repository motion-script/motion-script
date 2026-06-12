import { describe, it, expect } from 'vitest';
import { Sound } from '@/attributes/audio/sound';
import { AFX } from '@/attributes/audio/filters/chain';
import { AssetTracker } from '@/assets/tracker';
import { AssetCatalog } from '@/assets/catalog';
import type { AssetManifest } from '@/assets/manifest';
import type { AudioRequest } from '@/attributes/audio/request';

const SRC = 'song.mp3';
const DURATION = 10;

function makeTracker(): AssetTracker {
    const manifest: AssetManifest = {
        image: {},
        video: {},
        audio: { [SRC]: { duration: DURATION, sizeBytes: 0, src: SRC } },
        font: {},
    };
    return new AssetTracker(new AssetCatalog(manifest));
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
        const sound = new Sound({ src: SRC, filters: AFX.gain(2).lowpass(800), trimEnd: 4 });
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
        expect(new Sound({ src: SRC, filters: AFX.speed(2).speed(1.5) }).effectiveSpeed()).toBe(3);
    });

    it('ignores non-positive speeds', () => {
        expect(new Sound({ src: SRC, filters: AFX.speed(0) }).effectiveSpeed()).toBe(1);
    });
});

describe('SpeedFilter timing', () => {
    it('shrinks endAt for a faster clip (explicit trimEnd)', () => {
        // 4s of source at 2x => 2s of scene time.
        const sound = new Sound({ src: SRC, filters: AFX.speed(2), trimEnd: 4 });
        const req = emit(sound, 0);
        expect(req.endAt).toBeCloseTo(2);
    });

    it('grows endAt for a slower clip', () => {
        // 4s of source at 0.5x => 8s of scene time.
        const sound = new Sound({ src: SRC, filters: AFX.speed(0.5), trimEnd: 4 });
        const req = emit(sound, 0);
        expect(req.endAt).toBeCloseTo(8);
    });

    it('divides the catalog-resolved full length by speed in prepare()', () => {
        // Unbounded clip resolves to full 10s source, played at 2x => 5s scene time.
        const sound = new Sound({ src: SRC, filters: AFX.speed(2) });
        const req = emit(sound, 0);
        expect(req.endAt).toBeCloseTo(5);
    });

    it('leaves endAt unchanged at speed 1', () => {
        const sound = new Sound({ src: SRC, trimEnd: 4 });
        const req = emit(sound, 0);
        expect(req.endAt).toBeCloseTo(4);
    });
});

/** Drive a play() generator at a fixed dt and return the total time it blocked. */
function runPlay(sound: Sound, dt = 1 / 60): number {
    const gen = sound.play();
    let elapsed = 0;
    let step = gen.next(); // prime: start() + first yield from wait()
    while (!step.done) {
        elapsed += dt;
        step = gen.next(dt);
    }
    return elapsed;
}

describe('Sound.play duration', () => {
    it('blocks for the trimmed length at speed 1', () => {
        const sound = new Sound({ src: SRC, trimEnd: 4 });
        expect(runPlay(sound)).toBeCloseTo(4, 1);
    });

    it('blocks for half as long at 2x speed', () => {
        const sound = new Sound({ src: SRC, filters: AFX.speed(2), trimEnd: 4 });
        expect(runPlay(sound)).toBeCloseTo(2, 1);
    });

    it('blocks for twice as long at 0.5x speed', () => {
        const sound = new Sound({ src: SRC, filters: AFX.speed(0.5), trimEnd: 4 });
        expect(runPlay(sound)).toBeCloseTo(8, 1);
    });
});
