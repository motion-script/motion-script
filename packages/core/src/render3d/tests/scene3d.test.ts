import { describe, it, expect } from 'vitest';
import { Graphics3D } from '@/render3d/graphics3d';
import { Scene3D } from '@/render3d/scene3d';

describe('Scene3D', () => {
    it('splices what a node draws into the scene at the current scope', () => {
        const scene = new Scene3D();
        scene.begin({ id: 'a', transform: { position: [1, 0, 0] } });
        scene.draw(new Graphics3D().box().sphere());
        scene.end();

        expect(scene.ops().map((o) => o.kind)).toEqual(['push', 'mesh', 'mesh', 'pop']);
    });

    it('carries the node id as the group key — the renderer\'s identity slot', () => {
        const scene = new Scene3D();
        scene.begin({ id: 'node-1', transform: { position: [0, 2, 0] } });
        scene.end();

        expect(scene.ops()[0]).toEqual({
            kind: 'push',
            transform: { position: [0, 2, 0], key: 'node-1' },
        });
    });

    it('records lights as ops, so they nest with the tree', () => {
        const scene = new Scene3D();
        scene.begin({ id: 'group' });
        scene.light({ type: 'directional', intensity: 2 });
        scene.end();

        expect(scene.ops().map((o) => o.kind)).toEqual(['push', 'light', 'pop']);
    });

    // A camera has a position, so it is placed in the hierarchy rather than set
    // as a scene-wide field — that is what lets one ride inside an animated rig.
    it('records the camera as an op and also reports the last one set', () => {
        const scene = new Scene3D();
        scene.begin({ id: 'rig', transform: { position: [0, 0, 10] } });
        scene.perspective({ fov: 45 });
        scene.end();

        expect(scene.ops().map((o) => o.kind)).toEqual(['push', 'camera', 'pop']);
        expect(scene.cameraDescriptor()).toEqual({ type: 'perspective', fov: 45 });
    });

    it('last writer wins for the scene-wide settings', () => {
        const scene = new Scene3D().perspective({ fov: 30 }).orthographic({ frustumHeight: 4 });
        expect(scene.cameraDescriptor()).toEqual({ type: 'orthographic', frustumHeight: 4 });

        // There is no background here any more — what is drawn behind a 3D scene
        // is the viewport's own 2D fill. The environment is the last-writer case.
        scene.environment({ preset: 'studio' }).environment({ src: '/dusk.hdr' });
        expect(scene.environmentDescriptor()).toEqual({ src: '/dusk.hdr' });
    });

    it('fog() coerces a bare Color, and its kind comes from which fields are set', () => {
        expect(new Scene3D().fog('#0b0d12').fogDescriptor()).toEqual({ color: '#0b0d12' });
        expect(new Scene3D().fog({ color: 'red', density: 0.1 }).fogDescriptor())
            .toEqual({ color: 'red', density: 0.1 });
        expect(new Scene3D().fog('red').fog(null).fogDescriptor()).toBeNull();
    });

    // `false` resolves to *null* rather than `{ enabled: false }`: there is one
    // question — are shadows on — and the renderer reads the absence, so an
    // "enabled: false" settings object would be a second way to say off.
    it('shadows() coerces booleans and settings alike', () => {
        expect(new Scene3D().shadows().shadowSettings()).toEqual({ enabled: true });
        expect(new Scene3D().shadows(true).shadowSettings()).toEqual({ enabled: true });
        expect(new Scene3D().shadows(false).shadowSettings()).toBeNull();
        expect(new Scene3D().shadows({ quality: 'high' }).shadowSettings())
            .toEqual({ enabled: true, quality: 'high' });
    });

    it('post() appends passes in order', () => {
        const scene = new Scene3D()
            .post({ type: 'bloom', strength: 0.4 })
            .post([{ type: 'vignette' }, { type: 'bloom' }]);

        expect(scene.postEffects().map((e) => e.type)).toEqual(['bloom', 'vignette', 'bloom']);
    });

    it('isEmpty is true until something drawable is recorded', () => {
        expect(new Scene3D().isEmpty()).toBe(true);
        // Settings and bare scoping still draw nothing.
        expect(new Scene3D().perspective().environment({ preset: 'studio' }).isEmpty()).toBe(true);
        const scoped = new Scene3D();
        scoped.begin({ id: 'a' });
        scoped.end();
        expect(scoped.isEmpty()).toBe(true);

        expect(new Scene3D().draw(new Graphics3D().box()).isEmpty()).toBe(false);
        expect(new Scene3D().light({ type: 'ambient' }).isEmpty()).toBe(false);
    });

    it('assertBalanced catches an unclosed scope', () => {
        const unclosed = new Scene3D();
        unclosed.begin({ id: 'a' });
        expect(() => unclosed.assertBalanced()).toThrow(/unclosed begin/);

        const extra = new Scene3D();
        extra.end();
        expect(() => extra.assertBalanced()).toThrow(/extra end/);

        const balanced = new Scene3D();
        balanced.begin({ id: 'a' });
        balanced.end();
        expect(() => balanced.assertBalanced()).not.toThrow();
    });
});
