import { type AudioMeta, type FontMeta, type ImageMeta, AssetManifest, type VideoMeta } from "./manifest";

/**
 * What a scene can ask about the assets available to it.
 *
 * Strictly read-only, and strictly about *metadata*: dimensions, durations, and
 * the font faces a family resolves to. Nothing here loads anything — that is
 * the {@link AssetManager}'s job, driven by what nodes declare into an
 * {@link AssetTracker}. Reachable from any node as `node.assets` and from a
 * scene generator as `stage.assets`.
 *
 * **Every lookup throws on a miss rather than returning `undefined`.** A missing
 * asset is a typo or a deleted file, and it is worth finding out during the
 * precomp pass (where it surfaces as a `BuildError` in the errors panel) rather
 * than at playback as a shape that silently fails to paint.
 *
 * An interface so a host can supply its own — a test double, or a catalog
 * backed by something other than a static manifest. {@link ManifestAssetCatalog}
 * is the implementation the runtime builds from the project's asset manifest.
 */
export interface AssetCatalog {
    /**
     * Metadata for an image.
     * @throws If the image is not in the manifest.
     */
    getImageMeta(src: string): ImageMeta;

    /**
     * Metadata for a video.
     * @throws If the video is not in the manifest.
     */
    getVideoMeta(src: string): VideoMeta;

    /**
     * Metadata for an audio track.
     * @throws If the audio file is not in the manifest.
     */
    getAudioMeta(src: string): AudioMeta;

    /**
     * Metadata for a single font face, by its `family@weight` lookup key.
     * @throws If the key is not in the manifest.
     */
    getFontMeta(key: string): FontMeta;

    /**
     * Every face registered for a family, across all weights and slants — what
     * the renderer registers so its font matcher can resolve any requested
     * weight to the nearest available file. Empty if the family is unknown.
     */
    getFontFamilyMetas(fontFamily: string): FontMeta[];

    /** Playback duration of a video, in seconds. */
    getVideoDuration(src: string): number;

    /** Playback duration of an audio file, in seconds. */
    getAudioDuration(src: string): number;

    /**
     * Duration of any *playable* source — an audio file, or a video whose audio
     * track is being played. Resolves against audio first and falls back to
     * video, so a video `src` can drive a `Sound` without a duplicate audio-only
     * manifest entry.
     * @throws If `src` is in neither manifest.
     */
    getMediaDuration(src: string): number;

    /** An image's intrinsic pixel dimensions. */
    getImageSize(src: string): { width: number; height: number };
}

/**
 * The {@link AssetCatalog} the runtime builds: a query engine over a static
 * {@link AssetManifest}.
 *
 * @example
 * ```ts
 * const catalog = new ManifestAssetCatalog(manifest);
 * catalog.getImageSize("hero-banner.png");   // { width: 1920, height: 1080 }
 * ```
 */
export class ManifestAssetCatalog implements AssetCatalog {
    constructor(private manifest: AssetManifest) { }

    /**
     * Normalize a caller-supplied asset `src` into the manifest's lookup key.
     * The manifest stores image/video/audio keys as the file's path relative
     * to the scanned public folder, using forward slashes with no leading
     * `./` or `/` (see `scanInto` in the vite-plugin's asset-manifest.ts).
     * Scene authors write `src` in whichever equivalent form is natural — a
     * bare filename, `"./sub/file.png"`, `"/sub/file.png"`, or a
     * Windows-authored backslash path — so normalize all of them to the same
     * key. Font lookups are keyed by `family@weight`, not a path, so they
     * don't go through this.
     */
    private normalizeKey(src: string): string {
        return src.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
    }

    getImageMeta(src: string): ImageMeta {
        const meta = this.manifest.image[this.normalizeKey(src)];
        if (!meta) throw new Error(`Image asset not found: "${src}". Check the file exists in your public folder and the src matches its filename.`);
        return meta;
    }

    getVideoMeta(src: string): VideoMeta {
        const meta = this.manifest.video[this.normalizeKey(src)];
        if (!meta) throw new Error(`Video asset not found: "${src}". Check the file exists in your public folder and the src matches its filename.`);
        return meta;
    }

    getAudioMeta(src: string): AudioMeta {
        const meta = this.manifest.audio[this.normalizeKey(src)];
        if (!meta) throw new Error(`No audio metadata for src: ${src}`);
        return meta;
    }

    getFontMeta(key: string): FontMeta {
        const meta = this.manifest.font[key];
        if (!meta) throw new Error(`No font metadata for key: ${key}`);
        return meta;
    }

    getFontFamilyMetas(fontFamily: string): FontMeta[] {
        return Object.values(this.manifest.font).filter(meta => meta.fontFamily === fontFamily);
    }

    getVideoDuration(src: string): number {
        return this.getVideoMeta(src).duration;
    }

    getAudioDuration(src: string): number {
        return this.getAudioMeta(src).duration;
    }

    getMediaDuration(src: string): number {
        const key = this.normalizeKey(src);
        const audio = this.manifest.audio[key];
        if (audio) return audio.duration;
        const video = this.manifest.video[key];
        if (video) return video.duration;
        throw new Error(`Audio asset not found: "${src}". Check the file exists in your public folder and the src matches its filename.`);
    }

    getImageSize(src: string): { width: number; height: number } {
        const { width, height } = this.getImageMeta(src);
        return { width, height };
    }
}
