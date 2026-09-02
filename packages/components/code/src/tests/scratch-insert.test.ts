import { describe, it, expect } from 'vitest';
import type { Command } from '@motion-script/core';
import { Code } from '../node';

/**
 * Play a command a frame at a time, which is what playback does with one.
 */
function drive(command: Command<never>, steps: number, dt: number) {
    const step = command._stepper();
    step.seek(0);
    for (let i = 0; i < steps; i++) step.advance(dt);
}

describe('scratch insert investigation', () => {
    it('inserts at line 2 col 3', () => {
        const code = new Code({ code: 'function add(a: number, b: number) {\n  return a + b;\n}', language: 'typescript' });
        const gen = code.insert([2, 3], 'if (a < 0) return b;\n  ', 1);
        drive(gen, 200, 0.01);
        console.log(JSON.stringify((code as any).joinedSource()));
    });
});
