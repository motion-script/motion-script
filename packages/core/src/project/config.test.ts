import { describe, it, expect } from 'vitest';
import { createProject } from '@/project/config';

describe('createProject', () => {
    it('applies defaults for an empty input', () => {
        const project = createProject({ name: 'Test' });
        expect(project.name).toBe('Test');
        expect(project.fps).toBe(60);
        expect(project.viewport).toEqual({ width: 1920, height: 1080 });
        expect(project.scenes).toEqual([]);
        expect(project.theme).toBeUndefined();
    });

    it('overrides fps, viewport, and scenes from props', () => {
        const scenes: any[] = [{ id: 'a' }];
        const project = createProject({ name: 'Test', fps: 30, viewport: { width: 640, height: 480 }, scenes });
        expect(project.fps).toBe(30);
        expect(project.viewport).toEqual({ width: 640, height: 480 });
        expect(project.scenes).toBe(scenes);
    });

    it('passes the theme through when provided', () => {
        const theme = { brand: '#ff0000' };
        expect(createProject({ name: 'Test', theme }).theme).toBe(theme);
    });

    it('uses the provided name', () => {
        const project = createProject({ name: 'Custom' });
        expect(project.name).toBe('Custom');
    });
});
