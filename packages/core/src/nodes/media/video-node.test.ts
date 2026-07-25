import { describe, it, expect } from 'vitest';
import { AssetTracker } from '@/assets/tracker';
import { AssetCatalog } from '@/assets/catalog';
import type { AssetManifest } from '@/assets/manifest';
import { Video } from '@/nodes/media/video-node';

const VIDEO_SRC = 'clip.mp4';

function makeCatalog(): AssetCatalog {
    const manifest: AssetManifest = {
        image: {},
        audio: {},
        video: { [VIDEO_SRC]: { width: 800, height: 600, duration: 5, sizeBytes: 0, src: VIDEO_SRC } },
        font: {},
    };
    return new AssetCatalog(manifest);
}

describe("Video.prepareAudio", () => {
    it("schedules the video's own audio track (frame-ranged, tracker-based — audio has no draw-call representation to infer from)", () => {
        const video = new Video({ width: 200, height: 100, src: VIDEO_SRC });
        const tracker = new AssetTracker(makeCatalog());
        tracker.start(0);
        video.prepareAudio(tracker);
        tracker.end();

        expect(tracker.audioRequests).toHaveLength(1);
        expect(tracker.audioRequests[0].src).toBe(VIDEO_SRC);
    });

    it("registers no audio when muted", () => {
        const video = new Video({ width: 200, height: 100, src: VIDEO_SRC, muted: true });
        const tracker = new AssetTracker(makeCatalog());
        tracker.start(0);
        video.prepareAudio(tracker);
        tracker.end();

        expect(tracker.audioRequests).toHaveLength(0);
    });

    it("registers no audio when not playing", () => {
        const video = new Video({ width: 200, height: 100, src: VIDEO_SRC, playing: false });
        const tracker = new AssetTracker(makeCatalog());
        tracker.start(0);
        video.prepareAudio(tracker);
        tracker.end();

        expect(tracker.audioRequests).toHaveLength(0);
    });

    it("does not register a picture request — that's inferred from render(), not prepareAudio", () => {
        const video = new Video({ width: 200, height: 100, src: VIDEO_SRC });
        const tracker = new AssetTracker(makeCatalog());
        tracker.start(0);
        video.prepareAudio(tracker);
        tracker.end();

        // The audio track shares its key with the picture (AssetTracker.requestAudio
        // dedupes by src), so an entry exists — but it's the audio record, not a
        // 'video' picture record (which only TrackRenderContext's render() replay
        // would produce).
        expect(tracker.assets.get(VIDEO_SRC)?.type).toBe('audio');
    });
});
