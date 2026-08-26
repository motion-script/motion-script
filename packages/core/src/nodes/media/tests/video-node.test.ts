import { describe, it, expect } from 'vitest';
import { CanvasAssetTracker } from '@/assets/tracker';
import { AssetCatalog, ManifestAssetCatalog } from '@/assets/catalog';
import type { AssetManifest } from '@/assets/manifest';
import { Video } from '@/nodes/media/video-node';
import { advanceNodeTime, type MutableNodeTime } from '@/nodes/node/node-time';

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

/**
 * A schedule is the only way to express a **pause**, which is why the property
 * pinned down below is the one that cannot be got from `playing`: a paused
 * stretch consumes no source, so the clip resumes where it stopped.
 *
 * Both halves are checked against the same schedule, because keeping them in
 * step is the entire reason the feature is shaped this way. The picture is read
 * through the resolved fill's `timestamp`; the sound through the requests the
 * tracker collected.
 */
describe("Video with a playback schedule", () => {
    /** The source time the picture is showing at `elapsed` seconds of node life. */
    function frameAt(video: Video, elapsed: number): number | null | undefined {
        const clock = video.time as MutableNodeTime;
        // `creation` is seeded on the node's *first* advance, so a node taken
        // straight to 10s would read `elapsed === 0` — see `advanceNodeTime`.
        // Seeding at zero is what the runtime does on the frame a node appears.
        if (!clock.started) advanceNodeTime(clock, 0);
        advanceNodeTime(clock, elapsed);
        // `renderSelf` is what syncs the fill in normal operation; the fill is
        // private, so go through the same public hook the render pass uses —
        // which needs a tracker inside a started frame, exactly as the render
        // walk gives it one.
        declare(video);
        return (video as unknown as { _video: { timestamp?: number | null } })._video?.timestamp;
    }

    /** Plays 0–2s, pauses until 5s, then runs on. */
    const PAUSED = [
        { at: 0, from: 0, duration: 2 },
        { at: 5, from: 2, duration: Infinity },
    ];

    it("holds the frame it paused on rather than the clip's first", () => {
        const video = new Video({ width: 200, height: 100, src: VIDEO_SRC, segments: PAUSED });

        expect(frameAt(video, 1)).toBeCloseTo(1);
        // Paused. Two seconds of source have been consumed and none since — the
        // behaviour `playing: false` cannot produce, since it holds `trimStart`.
        expect(frameAt(video, 3)).toBeCloseTo(2);
        expect(frameAt(video, 4.9)).toBeCloseTo(2);
        // Resumed: it carries on from 2s of source, not from 5s.
        expect(frameAt(video, 6)).toBeCloseTo(3);
    });

    it("holds the first frame before the schedule starts", () => {
        const video = new Video({
            width: 200, height: 100, src: VIDEO_SRC,
            segments: [{ at: 2, from: 0, duration: Infinity }],
        });

        expect(frameAt(video, 1)).toBeCloseTo(0);
        expect(frameAt(video, 3)).toBeCloseTo(1);
    });

    it("advances at the segment's own rate", () => {
        const video = new Video({
            width: 200, height: 100, src: VIDEO_SRC,
            segments: [{ at: 0, from: 0, duration: 2, speed: 2 }, { at: 2, from: 4, duration: Infinity }],
        });

        expect(frameAt(video, 1)).toBeCloseTo(2);
        expect(frameAt(video, 3)).toBeCloseTo(5);
    });

    it("clamps at the clip's out point", () => {
        const video = new Video({
            width: 200, height: 100, src: VIDEO_SRC, trimEnd: 3,
            segments: [{ at: 0, from: 0, duration: Infinity }],
        });

        expect(frameAt(video, 10)).toBeCloseTo(3);
    });

    it("is the same frame however the playhead reached it", () => {
        // The property everything else rests on. Scrubbing straight to 6s must
        // give the frame a playthrough gives, or an export matches neither.
        const scrubbed = new Video({ width: 200, height: 100, src: VIDEO_SRC, segments: PAUSED });
        expect(frameAt(scrubbed, 6)).toBeCloseTo(3);

        const played = new Video({ width: 200, height: 100, src: VIDEO_SRC, segments: PAUSED });
        for (const t of [0, 1, 2, 3, 4, 5]) frameAt(played, t);
        expect(frameAt(played, 6)).toBeCloseTo(3);
    });

    it("schedules one audio clip per segment, cut where the picture is reading", () => {
        const video = new Video({ width: 200, height: 100, src: VIDEO_SRC, segments: PAUSED });
        const tracker = declare(video);

        expect(tracker.audioRequests).toHaveLength(2);
        const [first, second] = tracker.audioRequests;
        // The played stretch: source 0–2, laid down at the second it begins.
        expect(first.startAt).toBeCloseTo(0);
        expect(first.trimStart).toBeCloseTo(0);
        // The resume: source 2 onward, and it starts at 5s — the pause is silent
        // rather than the sound running on underneath a frozen picture.
        expect(second.startAt).toBeCloseTo(5);
        expect(second.trimStart).toBeCloseTo(2);
    });

    it("carries each segment's own gain", () => {
        const video = new Video({
            width: 200, height: 100, src: VIDEO_SRC, volume: 1,
            segments: [{ at: 0, from: 0, duration: 1 }, { at: 2, from: 1, duration: 1, volume: 0.2 }],
        });
        const tracker = declare(video);

        expect(tracker.audioRequests[0].volume).toBeCloseTo(1);
        // Ducked on the resume — one command, rather than a play plus a tween.
        expect(tracker.audioRequests[1].volume).toBeCloseTo(0.2);
    });

    it("stays silent when muted, schedule or no", () => {
        const tracker = declare(new Video({
            width: 200, height: 100, src: VIDEO_SRC, muted: true, segments: PAUSED,
        }));

        expect(tracker.audioRequests).toHaveLength(0);
    });

    it("leaves an unscheduled video exactly as it was", () => {
        // The default path: no segments, so `playing`/`timestamp` mean what they
        // always meant and every existing scene renders unchanged.
        const tracker = declare(new Video({ width: 200, height: 100, src: VIDEO_SRC }));

        expect(tracker.audioRequests).toHaveLength(1);
        expect(tracker.audioRequests[0].trimStart ?? 0).toBeCloseTo(0);
    });
});
