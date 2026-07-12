import { describe, it, expect } from 'vitest';
import { expandSize } from '@/attributes/layout/size';

describe('expandSize', () => {
    it('copies size into both width and height', () => {
        const props: Record<string, unknown> = { size: 200 };
        expandSize(props);
        expect(props).toEqual({ size: 200, width: 200, height: 200 });
    });

    it('is a no-op when size is absent', () => {
        const props: Record<string, unknown> = { width: 10 };
        expandSize(props);
        expect(props).toEqual({ width: 10 });
    });

    it('prefers an explicit width over size', () => {
        const props: Record<string, unknown> = { size: 200, width: 50 };
        expandSize(props);
        expect(props).toEqual({ size: 200, width: 50, height: 200 });
    });

    it('prefers an explicit height over size', () => {
        const props: Record<string, unknown> = { size: 200, height: 50 };
        expandSize(props);
        expect(props).toEqual({ size: 200, width: 200, height: 50 });
    });

    it('leaves both untouched when both width and height are explicit', () => {
        const props: Record<string, unknown> = { size: 200, width: 10, height: 20 };
        expandSize(props);
        expect(props).toEqual({ size: 200, width: 10, height: 20 });
    });

    it('passes through a callback (reactive-binding) form unchanged', () => {
        const fn = () => 42;
        const props: Record<string, unknown> = { size: fn };
        expandSize(props);
        expect(props.width).toBe(fn);
        expect(props.height).toBe(fn);
    });
});
