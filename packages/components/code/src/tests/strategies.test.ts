import { describe, it, expect } from 'vitest';
import type { Command } from '@motion-script/core';
import { ContextMap, ManifestAssetCatalog, type Node } from '@motion-script/core';
import { Code } from '../node';
import { defaultCodeDiff, defaultCodePhases } from '../engine';

function attach<T extends Node>(node: T): T {
    node.attach({
        assets: new ManifestAssetCatalog({ image: {}, video: {}, audio: {}, font: {} }),
        context: ContextMap.EMPTY,
        time: 0,
    });
    return node;
}

const SOURCE = 'function add(a, b) {\n  return a + b;\n}';

function drive(command: Command<never>, steps: number, dt: number): void {
    const step = command._stepper();
    step.seek(0);
    for (let i = 0; i < steps; i++) step.advance(dt);
}

describe('pluggable diffStrategy / phaseStrategy', () => {
    it('calls a custom diffStrategy (not the default) when one is provided', () => {
        let calls = 0;
        const node = attach(new Code({
            code: SOURCE,
            language: 'typescript',
            diffStrategy: (from, to) => {
                calls++;
                return defaultCodeDiff(from, to);
            },
        }));
        drive(node.append('\nx();', 1), 120, 0.01);
        expect(calls).toBeGreaterThan(0);
    });

    it('calls a custom phaseStrategy (not the default) when one is provided', () => {
        let calls = 0;
        const node = attach(new Code({
            code: SOURCE,
            language: 'typescript',
            phaseStrategy: (hasRemoved, hasAdded) => {
                calls++;
                return defaultCodePhases(hasRemoved, hasAdded);
            },
        }));
        drive(node.append('\nx();', 1), 120, 0.01);
        expect(calls).toBeGreaterThan(0);
    });

    it('falls back to the default strategies when none are provided', () => {
        // No throw, no missing behavior — the constructor default (?? defaultX)
        // is exercised by every other test in this package already; this just
        // pins that omitting the option is a supported, working shape.
        const node = attach(new Code({ code: SOURCE, language: 'typescript' }));
        expect(() => drive(node.append('\nx();', 1), 120, 0.01)).not.toThrow();
    });
});
