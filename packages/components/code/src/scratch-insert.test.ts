import { describe, it, expect } from 'vitest';
import { Code } from './node';

/**
 * Run a command as a generator, which is still how a sequential scene drives
 * one — `Command` is iterable precisely so `yield*` keeps working.
 */
function drive(command: Iterable<void>, steps: number, dt: number) {
    const gen = command[Symbol.iterator]() as Generator<void, void, number>;
    gen.next();
    for (let i = 0; i < steps; i++) gen.next(dt);
}

describe('scratch insert investigation', () => {
    it('inserts at line 2 col 3', () => {
        const code = new Code({ code: 'function add(a: number, b: number) {\n  return a + b;\n}', language: 'typescript' });
        const gen = code.insert([2, 3], 'if (a < 0) return b;\n  ', 1);
        drive(gen, 200, 0.01);
        console.log(JSON.stringify((code as any).joinedSource()));
    });
});
