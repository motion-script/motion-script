import { describe, it, expect } from 'vitest';
import { AssetTracker } from '@/assets/tracker';
import { AssetCatalog } from '@/assets/catalog';
import type { AssetManifest } from '@/assets/manifest';
import { TrackRenderContext } from '@/render/track-render-context';
import { Graphics } from '@/render/graphics';
import { RenderContext } from '@/render/render-context';
import { Clip } from '@/render/clip';
import { Node } from '@/nodes/base/node';
import { Rect } from '@/nodes/geometry/rect-node';
import { Image } from '@/nodes/media/image-node';
import { Video } from '@/nodes/media/video-node';
import { Fills } from '@/attributes/shape/fill/chain';
import { Text } from '@/nodes/text/text-node';
import { Graphics3D } from '@/render3d/graphics3d';
import { Tex } from '@/render3d/builders';
import { FakeMeasureScope } from '@/runtime/runtime.fixtures';

const IMAGE_SRC = 'photo.png';
const VIDEO_SRC = 'clip.mp4';
const scope = new FakeMeasureScope();

function makeCatalog(): AssetCatalog {
    const manifest: AssetManifest = {
        image: { [IMAGE_SRC]: { width: 800, height: 600, sizeBytes: 0, src: IMAGE_SRC } },
        video: { [VIDEO_SRC]: { width: 800, height: 600, duration: 5, sizeBytes: 0, src: VIDEO_SRC } },
        audio: {},
        font: {},
    };
    return new AssetCatalog(manifest);
}

/** Lay `node` out at `bounds`, then replay its render() against a fresh
 *  TrackRenderContext and return the tracker it wrote into. */
function trackFrom(node: Node, bounds = { x: 0, y: 0, width: 200, height: 100 }): AssetTracker {
    node.layout(bounds, scope);
    const tracker = new AssetTracker(makeCatalog());
    const ctx = new TrackRenderContext(tracker);
    tracker.start(0);
    ctx.execute(() => node.render(ctx));
    tracker.end();
    return tracker;
}

describe('TrackRenderContext', () => {
    it("registers an Image node's src at its rendered size, with no hand-written declaration", () => {
        const image = new Image({ width: 200, height: 100, src: IMAGE_SRC });
        const tracker = trackFrom(image);
        expect(tracker.assets.get(IMAGE_SRC)).toMatchObject({
            type: 'image', src: IMAGE_SRC, width: 200, height: 100,
        });
    });

    it("registers a Video node's src at its rendered size", () => {
        const video = new Video({ width: 200, height: 100, src: VIDEO_SRC });
        const tracker = trackFrom(video);
        expect(tracker.assets.get(VIDEO_SRC)).toMatchObject({
            type: 'video', src: VIDEO_SRC, width: 200, height: 100,
        });
    });

    it('registers an image fill on a plain ShapeNode (Rect) via its own fill prop', () => {
        const rect = new Rect({ width: 200, height: 100, fill: Fills.image(IMAGE_SRC) });
        const tracker = trackFrom(rect);
        expect(tracker.assets.get(IMAGE_SRC)).toMatchObject({
            type: 'image', src: IMAGE_SRC, width: 200, height: 100,
        });
    });

    it('registers an image fill used on a stroke, distinct from the main fill', () => {
        const rect = new Rect({
            width: 200, height: 100, fill: 'red',
            stroke: { weight: 4, fill: Fills.image(IMAGE_SRC) },
        });
        const tracker = trackFrom(rect);
        expect(tracker.assets.get(IMAGE_SRC)).toMatchObject({ type: 'image', src: IMAGE_SRC });
    });

    it('registers a font used by a raw Graphics().text() draw call, with no prepareLayout override', () => {
        class RawText extends Node {
            protected override renderSelf(ctx: RenderContext): void {
                ctx.draw(
                    new Graphics()
                        .text({ text: 'Hi', fontFamily: 'Custom Sans', fontWeight: 700, width: 100, height: 40 })
                        .fill('white'),
                );
            }
        }
        const node = new RawText({ width: 100, height: 40 });
        const tracker = trackFrom(node);
        expect(tracker.assets.get('Custom Sans')).toMatchObject({
            type: 'font', fontFamily: 'Custom Sans', fontWeight: 700,
        });
    });

    it('sizes a fill by the shape it actually paints, not the node\'s own layoutRect', () => {
        // A custom node that intentionally draws a rect smaller than its own
        // layout box — the fill must be sized by what is painted, not the cell.
        class Bar extends Node {
            protected override renderSelf(ctx: RenderContext): void {
                ctx.draw(new Graphics().rect({ width: 40, height: 30 }).fill(Fills.image(IMAGE_SRC)));
            }
        }
        const node = new Bar({ width: 200, height: 100 });
        const tracker = trackFrom(node);
        expect(tracker.assets.get(IMAGE_SRC)).toMatchObject({
            type: 'image', src: IMAGE_SRC, width: 40, height: 30,
        });
    });

    it('falls back to an unsized (0, 0) request for a fill painted on a raw path with no explicit width/height', () => {
        class Wedge extends Node {
            protected override renderSelf(ctx: RenderContext): void {
                ctx.draw(
                    new Graphics()
                        .path({ data: 'M0 0 L10 0 L10 10 Z' })
                        .fill(Fills.image(IMAGE_SRC)),
                );
            }
        }
        const node = new Wedge({ width: 200, height: 100 });
        const tracker = trackFrom(node);
        expect(tracker.assets.get(IMAGE_SRC)).toMatchObject({
            type: 'image', src: IMAGE_SRC, width: 0, height: 0,
        });
    });

    it('sizes a fill painted on a raw path that carries explicit width/height', () => {
        class Wedge extends Node {
            protected override renderSelf(ctx: RenderContext): void {
                ctx.draw(
                    new Graphics()
                        .path({ data: 'M0 0 L10 0 L10 10 Z', width: 60, height: 50 })
                        .fill(Fills.image(IMAGE_SRC)),
                );
            }
        }
        const node = new Wedge({ width: 200, height: 100 });
        const tracker = trackFrom(node);
        expect(tracker.assets.get(IMAGE_SRC)).toMatchObject({
            type: 'image', src: IMAGE_SRC, width: 60, height: 50,
        });
    });

    it('self-brackets draw() calls made with no frame open, rather than throwing', () => {
        // Defensive: draw() hits the same ensureFrame() throw TrackMeasureScope's
        // detached-measurement bug hit if ever invoked outside Precomp's
        // registry.start()/end() bracket. No confirmed trigger today, but nothing
        // structurally prevents one, so it's guarded the same way.
        const tracker = new AssetTracker(makeCatalog());
        const ctx = new TrackRenderContext(tracker);
        expect(tracker.isActive).toBe(false);

        expect(() => ctx.draw(new Graphics().rect({ width: 40, height: 30 }).fill(Fills.image(IMAGE_SRC)))).not.toThrow();

        expect(tracker.assets.get(IMAGE_SRC)).toMatchObject({ type: 'image', src: IMAGE_SRC, width: 40, height: 30 });
        expect(tracker.isActive).toBe(false);
    });

    it('does not need every abstract RenderContext member exercised to avoid throwing', () => {
        const ctx = new TrackRenderContext(new AssetTracker(makeCatalog()));
        expect(() => {
            ctx.transform({});
            ctx.beginBoolean('union');
            ctx.endBoolean();
            ctx.beginMask();
            ctx.applyMask();
            ctx.endMask();
            ctx.beginClip(new Clip());
            ctx.endClip();
            ctx.beginCamera({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 0 }, 1, 0);
            ctx.endCamera();
            ctx.measureText('x', 10, 'Inter');
            ctx.screenshot();
            ctx.unmount();
        }).not.toThrow();
    });
});

/**
 * A `Tex.surface` source is 2D content one level below the 3D scene, and it is a
 * value rather than a mounted child — so nothing walks it unless the tracking
 * context does. If this regresses, the failure is silent and looks like a font
 * that renders in the default face or an image that never appears.
 */
describe('3D surface sources', () => {
    const scene = (map: unknown) => new Graphics3D().plane({ unlit: true, map } as never);

    it('discovers a font used by a Graphics source', () => {
        const source = new Graphics().text({
            text: 'CPU', fontFamily: 'Pixelify Sans', fontWeight: 700, width: 512, height: 64,
        });
        const node = new Rect({ width: 200, height: 100 });
        node.fill = scene(Tex.surface(source, 512, 256)) as never;

        expect(trackFrom(node).assets.get('Pixelify Sans')).toMatchObject({ type: 'font' });
    });

    it('discovers an image fill nested inside a Graphics source', () => {
        const source = new Graphics()
            .rect({ width: 512, height: 256 })
            .fill(Fills.image(IMAGE_SRC));
        const node = new Rect({ width: 200, height: 100 });
        node.fill = scene(Tex.surface(source, 512, 256)) as never;

        expect(trackFrom(node).assets.get(IMAGE_SRC)).toBeTruthy();
    });

    // The arm that regresses most quietly: a detached subtree gets no asset
    // catalog from the tree, so only this walk can reach its `Text`.
    it('discovers a font used by a detached Node source', () => {
        const source = new Rect({
            width: 512, height: 256,
            children: [new Text({ text: 'SYSTEM', fontFamily: 'Pixelify Sans' })],
        });
        const node = new Rect({ width: 200, height: 100 });
        node.fill = scene(Tex.surface(source, 512, 256)) as never;

        expect(trackFrom(node).assets.get('Pixelify Sans')).toMatchObject({ type: 'font' });
    });

    it('still finds the scene\'s own image maps alongside the surface', () => {
        const source = new Graphics().rect({ width: 8, height: 8 });
        const g3 = new Graphics3D()
            .plane({ unlit: true, map: Tex.surface(source, 8, 8) })
            .box({ map: IMAGE_SRC });
        const node = new Rect({ width: 200, height: 100 });
        node.fill = g3 as never;

        expect(trackFrom(node).assets.get(IMAGE_SRC)).toBeTruthy();
    });
});
