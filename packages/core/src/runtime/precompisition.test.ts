import { describe, it, expect } from 'vitest';
import { Precomp } from '@/runtime/precompisition';
import {
    FakeScene,
    FakeMeasureScope,
    FakeAssetCatalog,
    asScene,
    asScenes,
    asCatalog,
    makeAudioRequest,
} from './runtime.fixtures';

const VIEWPORT = { width: 200, height: 100 };
const scope = new FakeMeasureScope();

function run(scenes: FakeScene[], fps = 10, catalog = new FakeAssetCatalog()) {
    return new Precomp(asScenes(scenes), VIEWPORT, fps, asCatalog(catalog), scope).run();
}

describe('Precomp – timeline accounting', () => {
    it('derives per-scene frame counts from the build generator', () => {
        const a = new FakeScene({ yieldCount: 3 });
        const b = new FakeScene({ yieldCount: 7 });
        const result = run([a, b], 10);

        expect(result.scenes.map((s) => s.frameCount)).toEqual([3, 7]);
    });

    it('assigns increasing global start frames', () => {
        const a = new FakeScene({ yieldCount: 3 });
        const b = new FakeScene({ yieldCount: 7 });
        const result = run([a, b], 10);

        expect(result.scenes.map((s) => s.startFrame)).toEqual([0, 3]);
    });

    it('totals frames and duration across scenes', () => {
        const result = run([new FakeScene({ yieldCount: 3 }), new FakeScene({ yieldCount: 7 })], 10);
        expect(result.totalFrames).toBe(10);
        expect(result.totalDuration).toBeCloseTo(1.0, 6);
        expect(result.fps).toBe(10);
    });

    it('resets each scene before and after its pass', () => {
        const a = new FakeScene({ yieldCount: 4 });
        run([a]);
        expect(a.resetCount).toBe(2);
        expect(a.buildCount).toBe(1);
    });

    it('lays out and prepares assets once per frame', () => {
        const a = new FakeScene({ yieldCount: 4 });
        run([a]);
        expect(a.layoutCalls).toHaveLength(4);
        expect(a.prepareCount).toBe(4);
    });
});

describe('Precomp – audio capture', () => {
    it('collects audio requests emitted during a scene', () => {
        const a = new FakeScene({
            yieldCount: 3,
            onPrepare: (tracker, frame) => {
                if (frame === 0) tracker.addAudioRequest(makeAudioRequest({ id: 'a-sound', src: 'a.mp3' }));
            },
        });
        const result = run([a]);
        expect(result.scenes[0].audioRequests.map((r) => r.id)).toEqual(['a-sound']);
    });

    it('keeps each scene’s audio separate (registry cleared between scenes)', () => {
        const a = new FakeScene({
            yieldCount: 2,
            onPrepare: (t, f) => { if (f === 0) t.addAudioRequest(makeAudioRequest({ id: 'a1', src: 'a.mp3' })); },
        });
        const b = new FakeScene({
            yieldCount: 2,
            onPrepare: (t, f) => { if (f === 0) t.addAudioRequest(makeAudioRequest({ id: 'b1', src: 'b.mp3' })); },
        });
        const result = run([a, b]);
        expect(result.scenes[0].audioRequests.map((r) => r.id)).toEqual(['a1']);
        expect(result.scenes[1].audioRequests.map((r) => r.id)).toEqual(['b1']);
    });

    it('clamps a clip that outlasts the scene to the scene boundary', () => {
        // Scene is 4 frames @ 10fps = 0.4s, but the clip claims to run to 5s.
        const a = new FakeScene({
            yieldCount: 4,
            onPrepare: (t, f) => {
                if (f === 0) t.addAudioRequest(makeAudioRequest({ id: 'long', src: 'a.mp3', startAt: 0, endAt: 5 }));
            },
        });
        const result = run([a]);
        expect(result.scenes[0].audioRequests).toHaveLength(1);
        expect(result.scenes[0].audioRequests[0].endAt).toBeCloseTo(0.4);
    });

    it('clamps an unbounded (looping) clip to the scene boundary', () => {
        const a = new FakeScene({
            yieldCount: 4,
            onPrepare: (t, f) => {
                if (f === 0) t.addAudioRequest(makeAudioRequest({ id: 'loop', src: 'a.mp3', startAt: 0, endAt: Infinity, loop: true }));
            },
        });
        const result = run([a]);
        expect(result.scenes[0].audioRequests[0].endAt).toBeCloseTo(0.4);
    });

    it('drops a clip that starts at or after the scene ends', () => {
        const a = new FakeScene({
            yieldCount: 4, // 0.4s scene
            onPrepare: (t, f) => {
                if (f === 0) t.addAudioRequest(makeAudioRequest({ id: 'late', src: 'a.mp3', startAt: 1, endAt: 2 }));
            },
        });
        const result = run([a]);
        expect(result.scenes[0].audioRequests).toHaveLength(0);
    });

    it('leaves a clip that fits within the scene untouched', () => {
        const a = new FakeScene({
            yieldCount: 10, // 1.0s scene
            onPrepare: (t, f) => {
                if (f === 0) t.addAudioRequest(makeAudioRequest({ id: 'fits', src: 'a.mp3', startAt: 0.1, endAt: 0.5 }));
            },
        });
        const result = run([a]);
        expect(result.scenes[0].audioRequests[0].endAt).toBeCloseTo(0.5);
    });
});

describe('Precomp – cross-scene (open) audio', () => {
    // An OPEN request is started but never stopped/trimmed; it should outlive its
    // scene and end at min(start + mediaDuration, projectTotal).

    it('lets an open bed continue past its scene and end at the media length', () => {
        // Scene A 0.4s, scene B 0.4s → project total 0.8s. Bed starts at A:0 with a
        // 0.6s media length → ends at absolute 0.6s, i.e. scene-local 0.6 (still in A's frame).
        const a = new FakeScene({
            yieldCount: 4,
            onPrepare: (t, f) => {
                if (f === 0) t.addAudioRequest(makeAudioRequest({
                    id: 'bed', src: 'a.mp3', startAt: 0, endAt: Infinity, open: true, mediaDuration: 0.6,
                }));
            },
        });
        const b = new FakeScene({ yieldCount: 4 });
        const result = run([a, b], 10);

        const bed = result.scenes[0].audioRequests[0];
        // Scene-local endAt; absolute end = sceneOffset(0) + 0.6 = 0.6s, within the 0.8s total.
        expect(bed.endAt).toBeCloseTo(0.6);
    });

    it('clamps an open bed to the project total when the media is longer', () => {
        // Project total 0.8s; bed media length 5s → clamped to project end (0.8s).
        const a = new FakeScene({
            yieldCount: 4,
            onPrepare: (t, f) => {
                if (f === 0) t.addAudioRequest(makeAudioRequest({
                    id: 'bed', src: 'a.mp3', startAt: 0, endAt: Infinity, open: true, mediaDuration: 5,
                }));
            },
        });
        const b = new FakeScene({ yieldCount: 4 });
        const result = run([a, b], 10);

        const bed = result.scenes[0].audioRequests[0];
        expect(bed.endAt).toBeCloseTo(0.8); // sceneOffset 0 + 0.8 total
    });

    it('runs an open looped bed to the project total', () => {
        const a = new FakeScene({
            yieldCount: 4,
            onPrepare: (t, f) => {
                if (f === 0) t.addAudioRequest(makeAudioRequest({
                    id: 'loop', src: 'a.mp3', startAt: 0, endAt: Infinity, loop: true, open: true,
                }));
            },
        });
        const b = new FakeScene({ yieldCount: 4 });
        const result = run([a, b], 10);

        expect(result.scenes[0].audioRequests[0].endAt).toBeCloseTo(0.8);
    });

    it('accounts for the scene offset when resolving a bed started in a later scene', () => {
        // Bed starts in scene B (offset 0.4s) with 0.2s media → absolute end 0.6s,
        // stored scene-local as 0.6 - 0.4 = 0.2.
        const a = new FakeScene({ yieldCount: 4 });
        const b = new FakeScene({
            yieldCount: 4,
            onPrepare: (t, f) => {
                if (f === 0) t.addAudioRequest(makeAudioRequest({
                    id: 'bed', src: 'b.mp3', startAt: 0, endAt: Infinity, open: true, mediaDuration: 0.2,
                }));
            },
        });
        const result = run([a, b], 10);

        expect(result.scenes[1].audioRequests[0].endAt).toBeCloseTo(0.2);
    });

    it('re-resolves an open bed when a later scene edit changes the total (HMR)', () => {
        const a = new FakeScene({
            yieldCount: 4,
            onPrepare: (t, f) => {
                if (f === 0) t.addAudioRequest(makeAudioRequest({
                    id: 'bed', src: 'a.mp3', startAt: 0, endAt: Infinity, open: true, mediaDuration: 5,
                }));
            },
        });
        const b = new FakeScene({ yieldCount: 4 });
        const precomp = new Precomp(asScenes([a, b]), VIEWPORT, 10, asCatalog(new FakeAssetCatalog()), scope);
        const first = precomp.run();
        // Initial total 0.8s → bed clamped to 0.8.
        expect(first.scenes[0].audioRequests[0].endAt).toBeCloseTo(0.8);

        // Grow scene B to 10 frames (1.0s) → total 1.4s; the bed (5s media) should now
        // extend to its full 1.4s clamp, proving the open marker survived re-assembly.
        const biggerB = new FakeScene({ yieldCount: 10 });
        const second = precomp.replaceScene(first, 1, asScene(biggerB));
        expect(second.totalDuration).toBeCloseTo(1.4);
        expect(second.scenes[0].audioRequests[0].endAt).toBeCloseTo(1.4);
    });
});

describe('Precomp – asset map (image)', () => {
    it('computes lead time and a backward-scrub tail for an image', () => {
        // Register a 512×512 image only from frame 5 onward (single 10-frame scene).
        const scene = new FakeScene({
            yieldCount: 10,
            onPrepare: (tracker, frame) => {
                if (frame >= 5) tracker.requestImage('img.png', 512, 512);
            },
        });
        const result = run([scene], 10);
        const track = result.assets.get('img.png')!;

        expect(track.record.type).toBe('image');
        expect(track.record.startFrame).toBe(5);
        expect(track.record.endFrame).toBe(9);
        // 512×512×4 = 1 MB → 2 frames of lead; cacheAt = startFrame − lead.
        expect(track.cacheAt).toBe(3);
        // Tail = endFrame + 30.
        expect(track.discardAt).toBe(39);
    });

    it('clamps cacheAt to 0 when the lead reaches before frame 0', () => {
        const scene = new FakeScene({
            yieldCount: 4,
            onPrepare: (tracker) => tracker.requestImage('hero.png', 512, 512),
        });
        const track = run([scene]).assets.get('hero.png')!;
        expect(track.cacheAt).toBe(0);
        expect(track.record.startFrame).toBe(0);
    });

    it('tracks the maximum requested resolution across frames', () => {
        const scene = new FakeScene({
            yieldCount: 3,
            onPrepare: (tracker, frame) => {
                tracker.requestImage('img.png', frame === 1 ? 800 : 100, frame === 1 ? 600 : 100);
            },
        });
        const record = run([scene]).assets.get('img.png')!.record;
        expect(record.type).toBe('image');
        if (record.type === 'image') {
            expect(record.width).toBe(800);
            expect(record.height).toBe(600);
        }
    });
});

describe('Precomp – asset map (font & video)', () => {
    it('always caches fonts at frame 0 and never discards them', () => {
        const scene = new FakeScene({
            yieldCount: 5,
            onPrepare: (tracker, frame) => { if (frame >= 2) tracker.requestFont('Inter', '700'); },
        });
        const track = run([scene]).assets.get('Inter')!;
        expect(track.record.type).toBe('font');
        expect(track.cacheAt).toBe(0);
        expect(track.discardAt).toBeNull();
    });

    it('gives video a heavier lead than the equivalent image and a discard tail', () => {
        const catalog = new FakeAssetCatalog({ 'clip.mp4': 5 });
        const scene = new FakeScene({
            yieldCount: 6,
            onPrepare: (tracker) => tracker.requestVideo('clip.mp4', 512, 512),
        });
        const track = run([scene], 30, catalog).assets.get('clip.mp4')!;
        expect(track.record.type).toBe('video');
        // Video lead clamps cacheAt to 0 here; the tail is endFrame + 30.
        expect(track.cacheAt).toBe(0);
        expect(track.discardAt).toBe(5 + 30);
    });

    it('emits a loader track keyed by the requested key, deduped across frames', () => {
        const load = async () => () => { };
        const scene = new FakeScene({
            yieldCount: 5,
            onPrepare: (tracker) => tracker.requestLoader('lang:java', load),
        });
        const result = run([scene], 30);
        const track = result.assets.get('lang:java')!;
        expect(track.record.type).toBe('loader');
        // One entry despite being requested every frame, with a backward-scrub tail.
        expect(track.cacheAt).toBe(0);
        expect(typeof track.discardAt).toBe('number');
    });
});

describe('Precomp – replaceScene (hot reload)', () => {
    it('re-runs only the replaced scene and shifts downstream start frames', () => {
        const a = new FakeScene({ yieldCount: 3 });
        const b = new FakeScene({ yieldCount: 7 });
        const precomp = new Precomp(asScenes([a, b]), VIEWPORT, 10, asCatalog(new FakeAssetCatalog()), scope);
        const first = precomp.run();
        expect(first.scenes.map(s => s.startFrame)).toEqual([0, 3]);

        // Edit scene 0 to be longer; scene 1 must shift, and only scene 0 re-runs.
        const aEdited = new FakeScene({ yieldCount: 5 });
        const bBuildsBefore = b.buildCount;
        const next = precomp.replaceScene(first, 0, asScene(aEdited));

        expect(next.scenes.map(s => s.frameCount)).toEqual([5, 7]);
        expect(next.scenes.map(s => s.startFrame)).toEqual([0, 5]);
        expect(next.totalFrames).toBe(12);
        // Scene 1 was reused, not rebuilt.
        expect(b.buildCount).toBe(bBuildsBefore);
        expect(aEdited.buildCount).toBe(1);
        // The reused scene's pass is carried forward (only startFrame is re-stamped):
        // its lifespans map is the same instance, proving it wasn't recomputed.
        expect(next.scenes[1].lifespans).toBe(first.scenes[1].lifespans);
        expect(next.scenes[1].frameCount).toBe(first.scenes[1].frameCount);
    });

    it('re-merges the global asset map, shifting the replaced scene’s assets', () => {
        const a = new FakeScene({ yieldCount: 3 });
        const b = new FakeScene({
            yieldCount: 4,
            onPrepare: (t, f) => { if (f === 0) t.requestImage('b.png', 100, 100); },
        });
        const precomp = new Precomp(asScenes([a, b]), VIEWPORT, 10, asCatalog(new FakeAssetCatalog()), scope);
        const first = precomp.run();
        // b's image starts at b's local frame 0 → global frame 3 (a is 3 long).
        expect(first.assets.get('b.png')!.record.startFrame).toBe(3);

        // Grow scene 0; b shifts later, so its asset's global start frame shifts too.
        const next = precomp.replaceScene(first, 0, asScene(new FakeScene({ yieldCount: 6 })));
        expect(next.assets.get('b.png')!.record.startFrame).toBe(6);
    });
});
