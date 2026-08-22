import { type AudioMeta, type FontMeta, type ImageMeta, AssetManifest, type VideoMeta } from "./manifest";

/**
 * A read-only query engine for retrieving strongly-typed asset metadata from an {@link AssetManifest}.
 * * Use this class to safely extract dimensions, durations, and specific configurations for images, 
 * videos, audio files, and fonts, with built-in runtime validation.
 * * @example
 * ```ts
 * import { AssetCatalog } from './catalog';
 * import { manifest } from './generated-manifest';
 * * const catalog = new AssetCatalog(manifest);
 * const dimensions = catalog.getImageSize("hero-banner.png");
 * console.log(dimensions.width); // 1920
 * ```
 */
export class AssetCatalog {
    /**
     * Creates an instance of AssetCatalog.
     * @param manifest - The underlying immutable asset manifest lookup structure.
     */
    constructor(private manifest: AssetManifest) { }

    /**
     * Normalize a caller-supplied asset `src` into the manifest's lookup key.
     * The manifest stores image/video/audio keys as the file's path relative
     * to the scanned public folder, using forward slashes with no leading
     * `./` or `/` (see `scanInto` in the CLI's asset-manifest.ts).
     * Scene authors write `src` in whichever equivalent form is natural — a
     * bare filename, `"./sub/file.png"`, `"/sub/file.png"`, or a
     * Windows-authored backslash path — so normalize all of them to the same
     * key. Font lookups are keyed by `family@weight`, not a path, so they
     * don't go through this.
     */
    private normalizeKey(src: string): string {
        return src.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
    }

    /**
     * Retrieves the complete metadata object for a specified image.
     * * @param src - The unique source path or identifier of the image asset.
     * @returns The associated {@link ImageMeta} block.
     * @throws {Error} If the image resource does not exist in the manifest.
     */
    getImageMeta(src: string): ImageMeta {
        const meta = this.manifest.image[this.normalizeKey(src)];
        if (!meta) throw new Error(`Image asset not found: "${src}". Check the file exists in your public folder and the src matches its filename.`);
        return meta;
    }

    /**
     * Retrieves the complete metadata object for a specified video.
     * * @param src - The unique source path or identifier of the video asset.
     * @returns The associated {@link VideoMeta} block.
     * @throws {Error} If the video resource does not exist in the manifest.
     */
    getVideoMeta(src: string): VideoMeta {
        const meta = this.manifest.video[this.normalizeKey(src)];
        if (!meta) throw new Error(`Video asset not found: "${src}". Check the file exists in your public folder and the src matches its filename.`);
        return meta;
    }

    /**
     * Retrieves the complete metadata object for a specified audio track.
     * * @param src - The unique source path or identifier of the audio asset.
     * @returns The associated {@link AudioMeta} block.
     * @throws {Error} If the audio resource does not exist in the manifest.
     */
    getAudioMeta(src: string): AudioMeta {
        const meta = this.manifest.audio[this.normalizeKey(src)];
        if (!meta) throw new Error(`No audio metadata for src: ${src}`);
        return meta;
    }

    /**
     * Retrieves the complete metadata object for a specified font face.
     * * @param key - The unique lookup key or family name of the font asset.
     * @returns The associated {@link FontMeta} block.
     * @throws {Error} If the font resource key does not exist in the manifest.
     */
    getFontMeta(key: string): FontMeta {
        const meta = this.manifest.font[key];
        if (!meta) throw new Error(`No font metadata for key: ${key}`);
        return meta;
    }

    /**
     * Return every font face registered for a family, across all weights and
     * slants. Used to register the whole family with the renderer so the font
     * matcher can resolve any requested weight to its nearest available file.
     * @param fontFamily - The font family name (e.g. "Inter").
     * @returns All matching {@link FontMeta} entries; empty if the family is unknown.
     */
    getFontFamilyMetas(fontFamily: string): FontMeta[] {
        return Object.values(this.manifest.font).filter(meta => meta.fontFamily === fontFamily);
    }

    /**
     * Convenient shortcut to get the exact playback duration of a video asset.
     * * @param src - The unique source path or identifier of the video asset.
     * @returns The duration of the video in seconds (or frames, depending on manifest standard).
     * @throws {Error} Inherits the missing asset error from {@link getVideoMeta}.
     */
    getVideoDuration(src: string): number {
        return this.getVideoMeta(src).duration;
    }

    /**
     * Convenient shortcut to get the exact playback duration of an audio asset.
     * * @param src - The unique source path or identifier of the audio asset.
     * @returns The duration of the audio in seconds.
     * @throws {Error} Inherits the missing asset error from {@link getAudioMeta}.
     */
    getAudioDuration(src: string): number {
        return this.getAudioMeta(src).duration;
    }

    /**
     * Playback duration for a *playable* media source — an audio file or a video
     * whose audio track is being played. Resolves against the audio manifest
     * first, falling back to the video manifest so a video `src` (e.g. `clip.mp4`)
     * can drive a {@link Sound} without a duplicate audio-only manifest entry.
     * @param src - The audio or video source path.
     * @returns The source's duration in seconds.
     * @throws {Error} If `src` is in neither the audio nor the video manifest.
     */
    getMediaDuration(src: string): number {
        const key = this.normalizeKey(src);
        const audio = this.manifest.audio[key];
        if (audio) return audio.duration;
        const video = this.manifest.video[key];
        if (video) return video.duration;
        throw new Error(`Audio asset not found: "${src}". Check the file exists in your public folder and the src matches its filename.`);
    }

    /**
     * Convenient shortcut to isolate the structural layout dimensions of an image asset.
     * * @param src - The unique source path or identifier of the image asset.
     * @returns An object containing the `width` and `height` dimensions of the asset.
     * @throws {Error} Inherits the missing asset error from {@link getImageMeta}.
     */
    getImageSize(src: string): { width: number; height: number } {
        const { width, height } = this.getImageMeta(src);
        return { width, height };
    }
}