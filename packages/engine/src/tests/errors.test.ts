import { describe, expect, it } from 'vitest';
import { EngineError, cleanPageErrorMessage, isEngineError, toRenderError } from '../errors.js';

describe('cleanPageErrorMessage', () => {
    it('strips the Playwright wrapper and the browser stack', () => {
        const raw = 'page.evaluate: Error: Unknown scene(s): nope. Available: intro\n    at eval (eval at …)';
        expect(cleanPageErrorMessage(new Error(raw))).toBe('Unknown scene(s): nope. Available: intro');
    });

    it('handles the other page entry points and non-Error throws', () => {
        expect(cleanPageErrorMessage(new Error('page.goto: net::ERR_CONNECTION_REFUSED'))).toBe('net::ERR_CONNECTION_REFUSED');
        expect(cleanPageErrorMessage('plain string')).toBe('plain string');
    });
});

describe('toRenderError', () => {
    it('reports a bad scene name as caller error, not engine failure', () => {
        const err = toRenderError(new Error('page.evaluate: Error: Unknown scene(s): nope. Available: intro'));
        expect(err.code).toBe('UNKNOWN_SCENE');
        expect(err.message).toBe('Unknown scene(s): nope. Available: intro');
    });

    it('falls back to RENDER_FAILED and keeps the cause', () => {
        const cause = new Error('page.evaluate: Error: CanvasKit surface lost');
        const err = toRenderError(cause);
        expect(err.code).toBe('RENDER_FAILED');
        expect(err.message).toBe('CanvasKit surface lost');
        expect(err.cause).toBe(cause);
    });

    it('passes an EngineError straight through rather than re-wrapping it', () => {
        const original = new EngineError('TIMEOUT', 'too slow');
        expect(toRenderError(original)).toBe(original);
    });
});

describe('isEngineError', () => {
    it('narrows only engine errors', () => {
        expect(isEngineError(new EngineError('CLOSED', 'x'))).toBe(true);
        expect(isEngineError(new Error('x'))).toBe(false);
        expect(isEngineError('x')).toBe(false);
    });
});
