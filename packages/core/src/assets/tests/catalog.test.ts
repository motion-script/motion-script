import { describe, it, expect } from 'vitest';
import { ManifestAssetCatalog } from '@/assets/catalog';
import type { AssetManifest } from '@/assets/manifest';

function makeManifest(): AssetManifest {
    return {
        image: {
            'brick-texture.png': { width: 10, height: 10, sizeBytes: 1, src: './brick-texture.png' },
            'textures/brick-texture.png': { width: 20, height: 20, sizeBytes: 2, src: './textures/brick-texture.png' },
        },
        video: {
            'clips/intro.mp4': { width: 100, height: 100, duration: 5, sizeBytes: 3, src: './clips/intro.mp4' },
        },
        audio: {
            'typewriter.wav': { duration: 1, sizeBytes: 1, src: './typewriter.wav' },
            'sfx/typewriter.wav': { duration: 2, sizeBytes: 2, src: './sfx/typewriter.wav' },
        },
        font: {},
    };
}

describe('AssetCatalog folder-qualified lookups', () => {
    it('resolves a root-level image by its bare filename (backward compatibility)', () => {
        const catalog = new ManifestAssetCatalog(makeManifest());
        expect(catalog.getImageMeta('brick-texture.png').width).toBe(10);
    });

    it('resolves a nested image via "folder/file.png", "./folder/file.png", "/folder/file.png", and a backslash path, all to the same distinct entry', () => {
        const catalog = new ManifestAssetCatalog(makeManifest());
        const bare = catalog.getImageMeta('textures/brick-texture.png');
        const dotSlash = catalog.getImageMeta('./textures/brick-texture.png');
        const leadingSlash = catalog.getImageMeta('/textures/brick-texture.png');
        const backslash = catalog.getImageMeta('textures\\brick-texture.png');

        expect(bare.width).toBe(20);
        expect(dotSlash).toEqual(bare);
        expect(leadingSlash).toEqual(bare);
        expect(backslash).toEqual(bare);

        // Never collides with the root-level file of the same basename.
        expect(bare.width).not.toBe(catalog.getImageMeta('brick-texture.png').width);
    });

    it('throws for a missing image, quoting the original (non-normalized) src', () => {
        const catalog = new ManifestAssetCatalog(makeManifest());
        expect(() => catalog.getImageMeta('missing.png')).toThrowError(/"missing\.png"/);
    });

    it('resolves nested and root audio distinctly, with the same normalization rules', () => {
        const catalog = new ManifestAssetCatalog(makeManifest());
        expect(catalog.getAudioMeta('typewriter.wav').duration).toBe(1);
        expect(catalog.getAudioMeta('./sfx/typewriter.wav').duration).toBe(2);
        expect(catalog.getAudioMeta('/sfx/typewriter.wav').duration).toBe(2);
    });

    it('resolves a nested video via a folder-qualified src', () => {
        const catalog = new ManifestAssetCatalog(makeManifest());
        expect(catalog.getVideoMeta('./clips/intro.mp4').duration).toBe(5);
    });

    it('getMediaDuration normalizes for both its audio and video branches', () => {
        const catalog = new ManifestAssetCatalog(makeManifest());
        expect(catalog.getMediaDuration('./sfx/typewriter.wav')).toBe(2);
        expect(catalog.getMediaDuration('./clips/intro.mp4')).toBe(5);
        expect(() => catalog.getMediaDuration('nonexistent.wav')).toThrowError(/"nonexistent\.wav"/);
    });
});
