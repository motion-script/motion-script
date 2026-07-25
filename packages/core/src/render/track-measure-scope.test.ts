import { describe, it, expect } from 'vitest';
import { AssetTracker } from '@/assets/tracker';
import { AssetCatalog } from '@/assets/catalog';
import type { AssetManifest } from '@/assets/manifest';
import { TrackMeasureScope } from '@/render/track-measure-scope';
import { Text } from '@/nodes/text/text-node';
import { RichText } from '@/nodes/text/richtext-node';
import { FakeMeasureScope } from '@/runtime/runtime.fixtures';

function emptyCatalog(): AssetCatalog {
    const manifest: AssetManifest = { image: {}, video: {}, audio: {}, font: {} };
    return new AssetCatalog(manifest);
}

function makeTrackScope(): { scope: TrackMeasureScope; tracker: AssetTracker } {
    const tracker = new AssetTracker(emptyCatalog());
    const scope = new TrackMeasureScope(new FakeMeasureScope(), tracker);
    return { scope, tracker };
}

describe('TrackMeasureScope', () => {
    it('registers the font it was asked to measure, then delegates to the real scope', () => {
        const { scope, tracker } = makeTrackScope();
        tracker.start(0);
        const width = scope.measureText('hello', 16, 'Inter', 700);
        tracker.end();

        expect(width).toBe(new FakeMeasureScope().measureText('hello', 16, 'Inter', 700));
        expect(tracker.assets.get('Inter')).toMatchObject({ type: 'font', fontFamily: 'Inter', fontWeight: 700 });
    });

    it("infers a Text node's font from its own measure() call, with no prepareLayout override", () => {
        const { scope, tracker } = makeTrackScope();
        const text = new Text({ text: 'Hello world', fontFamily: 'Custom Sans', fontWeight: 600, width: 'hug', height: 'hug' });
        tracker.start(0);
        text.measure({ maxWidth: 400, maxHeight: 200 }, scope);
        tracker.end();

        expect(tracker.assets.get('Custom Sans')).toMatchObject({
            type: 'font', fontFamily: 'Custom Sans', fontWeight: 600,
        });
    });

    it("infers a RichText node's per-span fonts, deduped by family", () => {
        const { scope, tracker } = makeTrackScope();
        const rich = new RichText({
            width: 'hug', height: 'hug',
            spans: [
                { text: 'Bold ', fontFamily: 'Serif A', fontWeight: 700 },
                { text: 'Regular', fontFamily: 'Serif B', fontWeight: 400 },
            ],
        });
        tracker.start(0);
        rich.measure({ maxWidth: 400, maxHeight: 200 }, scope);
        tracker.end();

        expect(tracker.assets.get('Serif A')).toMatchObject({ type: 'font', fontFamily: 'Serif A', fontWeight: 700 });
        expect(tracker.assets.get('Serif B')).toMatchObject({ type: 'font', fontFamily: 'Serif B', fontWeight: 400 });
    });

    it("still registers a run's font even when one of its \\n-split lines is empty", () => {
        // Closes the gap TrackMeasureScope would otherwise have: RichText.measure()
        // used to skip calling scope.measureText() for an empty split-line (e.g. a
        // blank line in the middle of otherwise real text), which would have made
        // that run's font invisible to inference on frames where it mattered.
        const { scope, tracker } = makeTrackScope();
        // A lone newline is a non-empty (truthy) run — so `runs()` includes it —
        // but splitting it on "\n" yields two EMPTY line segments, isolating the
        // guard this test targets (as opposed to a run with any non-empty line,
        // which would register the font via that line regardless of the fix).
        const rich = new RichText({
            width: 'hug', height: 'hug',
            spans: [{ text: '\n', fontFamily: 'Ghost Sans', fontWeight: 400 }],
        });
        tracker.start(0);
        rich.measure({ maxWidth: 400, maxHeight: 200 }, scope);
        tracker.end();

        expect(tracker.assets.get('Ghost Sans')).toMatchObject({ type: 'font', fontFamily: 'Ghost Sans' });
    });

    it('self-brackets and still registers the font when called with no frame open', () => {
        // Reproduces the real trigger: a node retains whatever MeasureScope it was
        // last laid out with (Node._lastScope) so an animated add/remove can
        // measure a detached "hug" child later — e.g. ChartLegend.showSeries()
        // calling `yield* this.addChildAt(...)` from inside the scene's own
        // generator body, entirely outside Precomp's registry.start()/end()
        // bracket for any frame. That's always been safe against a stateless real
        // MeasureScope; it must not throw against this one either.
        const { scope, tracker } = makeTrackScope();
        expect(tracker.isActive).toBe(false);

        expect(() => scope.measureText('hello', 16, 'Detached Sans', 500)).not.toThrow();

        expect(tracker.assets.get('Detached Sans')).toMatchObject({
            type: 'font', fontFamily: 'Detached Sans', fontWeight: 500,
        });
        // The self-bracket doesn't leak an open frame afterward.
        expect(tracker.isActive).toBe(false);
    });

    it('does not disturb an already-open outer frame when nested inside one', () => {
        const { scope, tracker } = makeTrackScope();
        tracker.start(5);
        scope.measureText('hello', 16, 'Nested Sans', 400);
        // Still open, and still frame 5 — a self-bracket must not have reset it.
        expect(tracker.isActive).toBe(true);
        scope.measureText('again', 16, 'Nested Sans', 400);
        tracker.end();

        expect(tracker.assets.get('Nested Sans')).toMatchObject({ type: 'font', fontFamily: 'Nested Sans' });
    });
});
