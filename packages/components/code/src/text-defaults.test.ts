import { describe, it, expect } from 'vitest';
import { Graphics2D, Node2D, RenderContext2D, DefaultTextStyle, type TextState } from '@motion-script/core';
import { Code } from './node';

/** Records the op lists reaching the backend seam, so a test can assert what a
 *  draw resolved to without a CanvasKit surface. */
class RecorderContext extends RenderContext2D {
    readonly drawn: Graphics2D[] = [];

    protected drawGraphics(graphics: Graphics2D): void {
        this.drawn.push(graphics);
    }

    /** Every `text` op state across every recorded draw, in draw order. */
    textStates(): Partial<TextState>[] {
        const states: Partial<TextState>[] = [];
        for (const graphics of this.drawn) {
            for (const op of graphics.ops()) {
                if (op.kind === 'text') states.push(op.state);
            }
        }
        return states;
    }

    measureText(): number { return 0; }
    unmount(): void { }
    execute(callback: () => void): void { callback(); }
    screenshot(): undefined { return undefined; }
    transform(): RenderContext2D { return this; }
    beginBoolean(): void { }
    endBoolean(): void { }
    beginMask(): void { }
    applyMask(): void { }
    endMask(): void { }
    beginClip(): void { }
    endClip(): void { }
    beginCamera(): void { }
    endCamera(): void { }
}

/** A minimal `Measurer` — `Code` only asks for advance widths. */
const scope = { measureText: (text: string, fontSize: number) => text.length * fontSize * 0.6 };

function render(root: Node2D): RecorderContext {
    root.layout({ x: 0, y: 0, width: 600, height: 300 }, scope as never);
    const ctx = new RecorderContext();
    ctx.execute(() => root.render(ctx));
    return ctx;
}

describe('Code refuses the ambient text-style defaults', () => {
    it('keeps its own font when drawn under a <DefaultTextStyle>', () => {
        const root = new DefaultTextStyle({
            fontFamily: 'Playfair Display',
            fontWeight: 700,
            fontSize: 96,
            letterSpacing: 8,
            children: [new Code({ code: 'const a = 1;', language: 'typescript', fontSize: 16 })],
        });

        const states = render(root).textStates();
        expect(states.length).toBeGreaterThan(0);
        for (const state of states) {
            // Its own props, not the document's.
            expect(state.fontFamily).toBe('Fira Mono');
            expect(state.fontSize).toBe(16);
            // A weight it never set stays unset rather than inheriting 700 —
            // token x positions were measured at the default weight.
            expect(state.fontWeight).toBeUndefined();
        }
    });

    it('closes its scope, so a sibling still inherits', () => {
        class RawLabel extends Node2D {
            protected override renderSelf(ctx: RenderContext2D): void {
                ctx.draw(new Graphics2D().text({ text: 'Hi' }).fill('white'));
            }
        }

        const root = new DefaultTextStyle({
            fontFamily: 'Playfair Display',
            children: [
                new Code({ code: 'x', language: 'typescript' }),
                new RawLabel({ width: 100, height: 40 }),
            ],
        });

        const states = render(root).textStates();
        expect(states[states.length - 1].fontFamily).toBe('Playfair Display');
    });
});
