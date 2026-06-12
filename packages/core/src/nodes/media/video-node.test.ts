import { describe, it, expect } from 'vitest';
import { Video } from '@/nodes/media/video-node';
import { AssetTracker } from '@/assets/tracker';
import { AssetCatalog } from '@/assets/catalog';
import type { AssetManifest } from '@/assets/manifest';

const SRC = 'band.mp4';
const DURATION = 6;

function makeCatalog(): AssetCatalog {
    const manifest: AssetManifest = {
        image: {},
        // The clip lives in the *video* manifest only — there is no audio-only
        // entry. Audio-from-video must resolve its duration from here.
        video: { [SRC]: { width: 1920, height: 1080, duration: DURATION, sizeBytes: 0, src: SRC } },
        audio: {},
        font: {},
    };
    return new AssetCatalog(manifest);
}

/** Lay out, tick, and run a prepare pass over `video`, returning the tracker. */
function prepareOnce(video: Video, time = 0): AssetTracker {
    const catalog = makeCatalog();
    video.bindAssets(catalog);
    video.layout({ x: 0, y: 0, width: 1920, height: 1080 }, {} as any);
    video.ellapse(time); // drives tick() → syncSound/syncVideo
    const tracker = new AssetTracker(catalog);
    tracker.start(0);
    video.prepare(tracker);
    tracker.end();
    return tracker;
}

describe('Video node – audio from a video file', () => {
    it('emits an audio request for the video src and resolves its length from the video manifest', () => {
        const video = new Video({ src: SRC });
        const tracker = prepareOnce(video);

        const reqs = tracker.audioRequests;
        expect(reqs).toHaveLength(1);
        expect(reqs[0].src).toBe(SRC);
        // Full-length default resolves against the video manifest duration.
        expect(reqs[0].endAt).toBeCloseTo(DURATION);
    });

    it('keeps the src tracked as a video asset (audio request must not clobber the video record)', () => {
        const video = new Video({ src: SRC });
        const tracker = prepareOnce(video);

        const record = tracker.assets.get(SRC);
        expect(record?.type).toBe('video');
    });

    it('contributes no audio when muted but still registers the video for the picture', () => {
        const video = new Video({ src: SRC, muted: true });
        const tracker = prepareOnce(video);

        expect(tracker.audioRequests).toHaveLength(0);
        expect(tracker.assets.get(SRC)?.type).toBe('video');
    });

    it('contributes no audio when not playing', () => {
        const video = new Video({ src: SRC, playing: false });
        const tracker = prepareOnce(video);
        expect(tracker.audioRequests).toHaveLength(0);
    });

    it('folds speed into the audio request so its timeline length matches the picture', () => {
        // 6s of source at 2x => 3s of scene time.
        const video = new Video({ src: SRC, speed: 2 });
        const reqs = prepareOnce(video).audioRequests;
        expect(reqs[0].filters).toContainEqual({ type: 'speed', value: 2 });
        expect(reqs[0].endAt).toBeCloseTo(DURATION / 2);
    });

    it('stamps the request with the owning node path so the timeline draws it on the Video bar', () => {
        const video = new Video({ src: SRC });
        const catalog = makeCatalog();
        video.bindAssets(catalog);
        video.layout({ x: 0, y: 0, width: 1920, height: 1080 }, {} as any);
        video.ellapse(0);
        const tracker = new AssetTracker(catalog);
        tracker.start(0);
        // prepareAssets stamps ownerPath via withOwnerPath; a bare prepare() does not.
        video.prepareAssets(tracker, '0.1');
        tracker.end();
        expect(tracker.audioRequests[0].ownerPath).toBe('0.1');
    });
});

describe('AssetCatalog.getMediaDuration', () => {
    it('falls back to the video manifest for a video src', () => {
        expect(makeCatalog().getMediaDuration(SRC)).toBe(DURATION);
    });

    it('throws for a src in neither manifest', () => {
        expect(() => makeCatalog().getMediaDuration('missing.mp4')).toThrow(/No audio or video metadata/);
    });
});
