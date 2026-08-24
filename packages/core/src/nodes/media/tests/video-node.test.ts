import { describe, it, expect } from 'vitest';
import { CanvasAssetTracker } from '@/assets/tracker';
import { AssetCatalog, ManifestAssetCatalog } from '@/assets/catalog';
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
    return new ManifestAssetCatalog(manifest);
}

/** Declare `video`'s assets into a fresh tracker and hand it back. */
function declare(video: Video): CanvasAssetTracker {
    const tracker = new CanvasAssetTracker(makeCatalog());
    tracker.start(0);
    video.prepareRender(tracker);
    tracker.end();
    return tracker;
}

describe("Video.prepareRender", () => {
    it("schedules the video's own audio track", () => {
        const tracker = declare(new Video({ width: 200, height: 100, src: VIDEO_SRC }));

        expect(tracker.audioRequests).toHaveLength(1);
        expect(tracker.audioRequests[0].src).toBe(VIDEO_SRC);
    });

    it("registers no audio when muted", () => {
        const tracker = declare(new Video({ width: 200, height: 100, src: VIDEO_SRC, muted: true }));

        expect(tracker.audioRequests).toHaveLength(0);
    });

    it("registers no audio when not playing", () => {
        const tracker = declare(new Video({ width: 200, height: 100, src: VIDEO_SRC, playing: false }));

        expect(tracker.audioRequests).toHaveLength(0);
    });

    it("declares the picture too, so one call covers the whole clip", () => {
        const tracker = declare(new Video({ width: 200, height: 100, src: VIDEO_SRC }));

        // Picture and sound share a key (`addAudio` dedupes by src and defers to
        // an existing `video` record, since the fill needs it to decode frames).
        // The picture is declared first, so that is the record that survives —
        // which is the point: both halves come from one hook now, rather than the
        // picture being inferred from a render pass the audio walk never saw.
        expect(tracker.assets.get(VIDEO_SRC)?.type).toBe('video');
    });

    it("declares nothing without a src", () => {
        const tracker = declare(new Video({ width: 200, height: 100 }));

        expect(tracker.assets.size).toBe(0);
        expect(tracker.audioRequests).toHaveLength(0);
    });
});
