import { describe, expect, it } from 'vitest';
import {
    parseBitrate,
    parseCodec,
    parseConcurrency,
    parseImageFormat,
    parseSceneNames,
    parseScale,
    parseSupersample,
    parseTimeout,
} from './validate.js';
import type { EngineError } from './errors.js';

const codeOf = (fn: () => unknown): string | undefined => {
    try {
        fn();
    } catch (err) {
        return (err as EngineError).code;
    }
    return undefined;
};

describe('parseBitrate', () => {
    it('reads the k / M suffixes a bitrate is normally written with', () => {
        expect(parseBitrate('12M')).toBe(12_000_000);
        expect(parseBitrate('40m')).toBe(40_000_000);
        expect(parseBitrate('12000k')).toBe(12_000_000);
        expect(parseBitrate('1.5M')).toBe(1_500_000);
        expect(parseBitrate('8000000')).toBe(8_000_000);
        expect(parseBitrate('12Mbps')).toBe(12_000_000);
        expect(parseBitrate(9_000_000)).toBe(9_000_000);
    });

    it('treats an absent value as "use the exporter default"', () => {
        expect(parseBitrate(undefined)).toBeUndefined();
        expect(parseBitrate('')).toBeUndefined();
    });

    it('rejects junk and non-positive values', () => {
        expect(codeOf(() => parseBitrate('fast'))).toBe('INVALID_OPTION');
        expect(codeOf(() => parseBitrate('0'))).toBe('INVALID_OPTION');
        expect(codeOf(() => parseBitrate(-1))).toBe('INVALID_OPTION');
    });
});

describe('parseCodec', () => {
    it('normalizes case and passes the known codecs', () => {
        expect(parseCodec('HEVC')).toBe('hevc');
        expect(parseCodec(' av1 ')).toBe('av1');
        expect(parseCodec(undefined)).toBeUndefined();
    });

    it('rejects an unknown codec at the edge instead of mid-render', () => {
        expect(codeOf(() => parseCodec('h264'))).toBe('INVALID_OPTION');
    });
});

describe('parseImageFormat', () => {
    it('defaults to png and keeps the caller jpg/jpeg spelling for the extension', () => {
        expect(parseImageFormat(undefined)).toEqual({ format: 'png', extension: 'png', mimeType: 'image/png' });
        expect(parseImageFormat('jpg')).toEqual({ format: 'jpeg', extension: 'jpg', mimeType: 'image/jpeg' });
        expect(parseImageFormat('.JPEG')).toEqual({ format: 'jpeg', extension: 'jpeg', mimeType: 'image/jpeg' });
    });

    it('rejects an unsupported format', () => {
        expect(codeOf(() => parseImageFormat('webp'))).toBe('INVALID_OPTION');
    });
});

describe('parseSceneNames', () => {
    it('splits, trims and drops blanks; an empty selection means every scene', () => {
        expect(parseSceneNames('intro, outro')).toEqual(['intro', 'outro']);
        expect(parseSceneNames(['a,b', ' c '])).toEqual(['a', 'b', 'c']);
        expect(parseSceneNames('  ,  ')).toBeUndefined();
        expect(parseSceneNames(undefined)).toBeUndefined();
    });
});

describe('numeric options', () => {
    it('defaults scale to 1 and requires it to be positive', () => {
        expect(parseScale(undefined)).toBe(1);
        expect(parseScale('2')).toBe(2);
        expect(codeOf(() => parseScale(0))).toBe('INVALID_OPTION');
        expect(codeOf(() => parseScale(-1))).toBe('INVALID_OPTION');
    });

    it('bounds supersample to 1..4, where the cost is quadratic', () => {
        expect(parseSupersample(undefined)).toBeUndefined();
        expect(parseSupersample(2)).toBe(2);
        expect(codeOf(() => parseSupersample(5))).toBe('INVALID_OPTION');
        expect(codeOf(() => parseSupersample(1.5))).toBe('INVALID_OPTION');
    });

    it('requires a whole concurrency of at least one', () => {
        expect(parseConcurrency(undefined)).toBe(1);
        expect(parseConcurrency(4)).toBe(4);
        expect(codeOf(() => parseConcurrency(0))).toBe('INVALID_OPTION');
        expect(codeOf(() => parseConcurrency(2.5))).toBe('INVALID_OPTION');
    });

    it('keeps 0 as an explicit "no timeout" rather than falling back', () => {
        expect(parseTimeout(undefined, 1000)).toBe(1000);
        expect(parseTimeout(0, 1000)).toBe(0);
        expect(codeOf(() => parseTimeout(-5, 1000))).toBe('INVALID_OPTION');
    });
});
