import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    componentsConfigExists,
    defaultComponentsConfig,
    loadComponentsConfig,
    writeComponentsConfig,
    DEFAULT_COMPONENTS_ALIAS,
    DEFAULT_COMPONENTS_PATH,
} from './config.js';

describe('components.json config', () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-cli-config-'));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('reports absent when no components.json exists', () => {
        expect(componentsConfigExists(dir)).toBe(false);
        expect(loadComponentsConfig(dir)).toBeNull();
    });

    it('round-trips a written config', () => {
        const config = defaultComponentsConfig();
        writeComponentsConfig(dir, config);

        expect(componentsConfigExists(dir)).toBe(true);
        expect(loadComponentsConfig(dir)).toEqual(config);
    });

    it('applies sensible defaults', () => {
        const config = defaultComponentsConfig();
        expect(config.aliases.components).toBe(DEFAULT_COMPONENTS_ALIAS);
        expect(config.paths.components).toBe(DEFAULT_COMPONENTS_PATH);
        expect(config.project).toBe('src/project.ts');
    });

    it('accepts a project path override', () => {
        const config = defaultComponentsConfig({ project: 'src/main.ts' });
        expect(config.project).toBe('src/main.ts');
    });
});
