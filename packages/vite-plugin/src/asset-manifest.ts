import path from 'node:path';
import fs from 'node:fs';
// @ts-expect-error fontkit ships no types; we use the small surface below.
import { openSync as openFontSync } from 'fontkit';
import { imageSize } from 'image-size';
import { parseFile } from 'music-metadata';

interface FontkitFont {
    familyName?: string;
    'OS/2'?: { usWeightClass?: number; fsSelection?: { italic?: boolean } };
    name?: { records?: { preferredFamily?: Record<string, string> } };
}

export interface ImageMeta {
    width: number;
    height: number;
    sizeBytes: number;
    src: string;
}

export interface VideoMeta {
    width: number;
    height: number;
    duration: number;
    sizeBytes: number;
    src: string;
}

export interface AudioMeta {
    duration: number;
    sizeBytes: number;
    src: string;
}

export interface FontMeta {
    fontFamily: string;
    fontWeight: number;
    src: string;
    sizeBytes: number;
}

export interface AssetManifest {
    image: Record<string, ImageMeta>;
    video: Record<string, VideoMeta>;
    audio: Record<string, AudioMeta>;
    font: Record<string, FontMeta>;
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.m4v']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.opus']);
const FONT_EXTS = new Set(['.ttf', '.otf', '.woff', '.woff2']);

type AssetKind = 'image' | 'video' | 'audio' | 'font' | null;

function classify(ext: string): AssetKind {
    const e = ext.toLowerCase();
    if (IMAGE_EXTS.has(e)) return 'image';
    if (VIDEO_EXTS.has(e)) return 'video';
    if (AUDIO_EXTS.has(e)) return 'audio';
    if (FONT_EXTS.has(e)) return 'font';
    return null;
}

function emptyManifest(): AssetManifest {
    return { image: {}, video: {}, audio: {}, font: {} };
}

function walk(dir: string, base: string = dir): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...walk(full, base));
        } else if (entry.isFile()) {
            out.push(full);
        }
    }
    return out;
}

async function readImage(file: string, src: string, sizeBytes: number): Promise<ImageMeta> {
    try {
        const buf = fs.readFileSync(file);
        const { width = 0, height = 0 } = imageSize(buf);
        return { src, sizeBytes, width, height };
    } catch {
        return { src, sizeBytes, width: 0, height: 0 };
    }
}

async function readVideo(file: string, src: string, sizeBytes: number): Promise<VideoMeta> {
    try {
        const meta = await parseFile(file, { duration: true });
        const videoTrack = meta.format.trackInfo.find(t => t.video)?.video;
        return {
            src,
            sizeBytes,
            duration: meta.format.duration ?? 0,
            width: videoTrack?.displayWidth ?? videoTrack?.pixelWidth ?? 0,
            height: videoTrack?.displayHeight ?? videoTrack?.pixelHeight ?? 0,
        };
    } catch {
        return { src, sizeBytes, duration: 0, width: 0, height: 0 };
    }
}

async function readAudio(file: string, src: string, sizeBytes: number): Promise<AudioMeta> {
    try {
        const meta = await parseFile(file, { duration: true });
        return { src, sizeBytes, duration: meta.format.duration ?? 0 };
    } catch {
        return { src, sizeBytes, duration: 0 };
    }
}

function readFont(file: string, src: string, sizeBytes: number): { key: string; meta: FontMeta } {
    try {
        const font = openFontSync(file) as FontkitFont;
        const preferredFamily = font.name?.records?.preferredFamily;
        const fontFamily = (preferredFamily && Object.values(preferredFamily)[0])
            ?? font.familyName
            ?? path.parse(file).name;
        const weight = font['OS/2']?.usWeightClass ?? 400;
        const italic = font['OS/2']?.fsSelection?.italic ?? false;
        return {
            key: `${fontFamily}@${weight}${italic ? 'i' : ''}`,
            meta: { fontFamily, fontWeight: weight, src, sizeBytes },
        };
    } catch {
        const fontFamily = path.parse(file).name;
        return {
            key: `${fontFamily}@400`,
            meta: { fontFamily, fontWeight: 400, src, sizeBytes },
        };
    }
}

async function scanInto(manifest: AssetManifest, dir: string, srcPrefix: string): Promise<void> {
    if (!fs.existsSync(dir)) return;

    const files = walk(dir);
    await Promise.all(files.map(async file => {
        const ext = path.extname(file);
        const kind = classify(ext);
        if (!kind) return;

        const rel = path.relative(dir, file).split(path.sep).join('/');
        const src = `${srcPrefix}${rel}`;
        const key = path.basename(file);
        const sizeBytes = fs.statSync(file).size;

        if (kind === 'image') {
            manifest.image[key] = await readImage(file, src, sizeBytes);
        } else if (kind === 'video') {
            manifest.video[key] = await readVideo(file, src, sizeBytes);
        } else if (kind === 'audio') {
            manifest.audio[key] = await readAudio(file, src, sizeBytes);
        } else if (kind === 'font') {
            const { key: fontKey, meta } = readFont(file, src, sizeBytes);
            manifest.font[fontKey] = meta;
        }
    }));
}

/**
 * Build an AssetManifest by scanning the user's public folder, plus any built-in
 * default folders (e.g. plugin-app's bundled fonts) scanned first so the user's
 * own assets override them on key collision. Defaults are served from the site
 * root (`/file.ttf`), so their manifest `src` is an absolute path; the user's
 * assets stay relative (`./file.ttf`). Returns an empty manifest if nothing exists.
 */
export async function buildAssetManifest(
    publicDir: string,
    defaultDirs: string[] = [],
): Promise<AssetManifest> {
    const manifest = emptyManifest();

    // Scan defaults first; the user's public folder is scanned last so identical
    // keys (e.g. the same font family@weight) replace the bundled defaults.
    for (const dir of defaultDirs) {
        await scanInto(manifest, dir, '/');
    }
    await scanInto(manifest, publicDir, './');

    return manifest;
}
