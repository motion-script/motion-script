import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAssetManifest } from '../asset-manifest';

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-asset-manifest-'));
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('buildAssetManifest key generation', () => {
    it('keys a nested-folder image distinctly from a root file of the same basename', async () => {
        fs.mkdirSync(path.join(tmpDir, 'textures'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'brick-texture.png'), 'root');
        fs.writeFileSync(path.join(tmpDir, 'textures', 'brick-texture.png'), 'nested');

        const manifest = await buildAssetManifest(tmpDir);

        expect(Object.keys(manifest.image).sort()).toEqual(['brick-texture.png', 'textures/brick-texture.png']);
        expect(manifest.image['brick-texture.png'].src).toBe('./brick-texture.png');
        expect(manifest.image['textures/brick-texture.png'].src).toBe('./textures/brick-texture.png');
    });

    it('does the same for audio (sfx/ subfolder)', async () => {
        fs.mkdirSync(path.join(tmpDir, 'sfx'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'typewriter.wav'), 'root');
        fs.writeFileSync(path.join(tmpDir, 'sfx', 'typewriter.wav'), 'nested');

        const manifest = await buildAssetManifest(tmpDir);

        expect(Object.keys(manifest.audio).sort()).toEqual(['sfx/typewriter.wav', 'typewriter.wav']);
        expect(manifest.audio['sfx/typewriter.wav'].src).toBe('./sfx/typewriter.wav');
        expect(manifest.audio['typewriter.wav'].src).toBe('./typewriter.wav');
    });

    it('still keys a root-level-only file by its bare filename (backward compatibility)', async () => {
        fs.writeFileSync(path.join(tmpDir, 'solo.png'), 'x');
        const manifest = await buildAssetManifest(tmpDir);
        expect(manifest.image['solo.png']?.src).toBe('./solo.png');
    });

    it('lets the user public folder override a default dir on identical relative-path collision', async () => {
        const defaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-asset-manifest-default-'));
        try {
            fs.writeFileSync(path.join(defaultDir, 'shared.png'), 'default');
            fs.writeFileSync(path.join(tmpDir, 'shared.png'), 'user');

            const manifest = await buildAssetManifest(tmpDir, [defaultDir]);

            expect(manifest.image['shared.png'].src).toBe('./shared.png');
        } finally {
            fs.rmSync(defaultDir, { recursive: true, force: true });
        }
    });
});
