import { describe, it, expect } from 'vitest';
import { toCsv, parseCsv } from './csv';
import { encodeCache, decodeCache, TABLES, type CacheEntry } from './precomp-csv';

/**
 * The CSV layer is where a precomp entry is taken apart into rows and put back
 * together. Everything it can get wrong is silent: a mis-escaped field, a value
 * that comes back as a string instead of a number, an `Infinity` flattened to
 * something finite. None of those throw — they just produce a subtly wrong
 * timeline later. So the round trip is tested on the awkward values, not the easy
 * ones.
 */

describe('CSV encoding', () => {
    it('round-trips fields containing delimiters, quotes and newlines', () => {
        const rows = [
            ['plain', 'has,comma'],
            ['has"quote', 'has\nnewline'],
            ['', 'trailing space '],
            ['"fully quoted"', 'a,b"c\nd'],
        ];
        const parsed = parseCsv(toCsv(['a', 'b'], rows), ['a', 'b']);
        expect(parsed).toEqual(rows);
    });

    it('reads a file written with CRLF line endings', () => {
        // Git on Windows will happily rewrite the line endings of a committed cache.
        const crlf = 'a,b\r\n1,2\r\n3,4\r\n';
        expect(parseCsv(crlf, ['a', 'b'])).toEqual([['1', '2'], ['3', '4']]);
    });

    it('refuses a file whose header does not match', () => {
        // Columns are read positionally, so a changed header means changed meaning.
        expect(parseCsv('b,a\n1,2\n', ['a', 'b'])).toEqual([]);
        expect(parseCsv('a\n1\n', ['a', 'b'])).toEqual([]);
    });

    it('preserves an empty field as an empty string', () => {
        // A scene root's structural path is "", so blank is real data here.
        expect(parseCsv(toCsv(['a', 'b'], [['', 'x']]), ['a', 'b'])).toEqual([['', 'x']]);
    });
});

describe('precomp cache tables', () => {
    /** An entry exercising every column, including the values most likely to break. */
    function richEntry(): CacheEntry {
        return {
            deps: [['src/project.ts', 'aaaa'], ['src/scenes/intro.tsx', 'bbbb']],
            precomp: {
                format: 1,
                frameCount: 423,
                audioRequests: [{
                    id: 'clip-1', src: 'bed.mp3', startAt: 0, endAt: 4.5,
                    trimStart: 0, volume: 0.8, loop: false, open: true,
                    mediaDuration: 60, ownerPath: '0.2.1',
                    filters: [{ type: 'gain', value: 0.5 }],
                }],
                assetRecords: [
                    ['img,with,commas.png', {
                        type: 'image', src: 'img,with,commas.png',
                        startFrame: 0, endFrame: 12, width: 640, height: 480,
                    }],
                    ['bed.mp3', {
                        type: 'audio', src: 'bed.mp3',
                        startFrame: 0, endFrame: 12, trimStart: 0, trimEnd: 'Infinity',
                    }],
                    ['Inter', {
                        type: 'font', src: 'Inter', startFrame: 0, endFrame: 12,
                        fontFamily: 'Inter', fontWeight: 700,
                    }],
                ],
                lifespans: [['', { startFrame: 0, endFrame: 422 }], ['0.1', { startFrame: 5, endFrame: 100 }]],
            },
        };
    }

    it('round-trips a full entry through the tables', () => {
        const entry = richEntry();
        const files = encodeCache(1, {
            engine: '2.11.3', manifest: 'deadbeef',
            entries: new Map([['src/scenes/intro.tsx', entry]]),
        });

        const back = decodeCache(1, files);
        expect(back).not.toBeNull();
        expect(back!.engine).toBe('2.11.3');
        expect(back!.manifest).toBe('deadbeef');

        const got = back!.entries.get('src/scenes/intro.tsx');
        expect(got).toBeDefined();
        expect(got!.deps).toEqual(entry.deps);
        expect(got!.precomp).toEqual(entry.precomp);
    });

    it('keeps an untrimmed clip unbounded rather than coercing it', () => {
        // `trimEnd: Infinity` means "to the end of the media". Reading it back as a
        // number would silently truncate every untrimmed clip in the project.
        const files = encodeCache(1, {
            engine: 'e', manifest: 'm',
            entries: new Map([['s', richEntry()]]),
        });
        const audio = decodeCache(1, files)!.entries.get('s')!.precomp.assetRecords as [string, Record<string, unknown>][];
        expect(audio.find(([k]) => k === 'bed.mp3')![1].trimEnd).toBe('Infinity');
    });

    it('rejects a cache written by a different format version', () => {
        const files = encodeCache(1, { engine: 'e', manifest: 'm', entries: new Map([['s', richEntry()]]) });
        expect(decodeCache(2, files)).toBeNull();
    });

    it('produces byte-identical output for identical input', () => {
        // An unchanged project must not churn the files, or committing the cache
        // would put a diff in every commit.
        const args = { engine: 'e', manifest: 'm', entries: new Map([['s', richEntry()]]) };
        expect(encodeCache(1, args)).toEqual(encodeCache(1, args));
    });

    it('writes one row per dependency rather than repeating field names', () => {
        // The reason for the format: the tables name each column once.
        const files = encodeCache(1, {
            engine: 'e', manifest: 'm',
            entries: new Map([['s', richEntry()]]),
        });
        // And refers to the scene by its small id, not by repeating its path —
        // these row tables are the bulk of the cache.
        expect(files[TABLES.deps.file]).toBe(
            'sceneId,path,hash\n0,src/project.ts,aaaa\n0,src/scenes/intro.tsx,bbbb\n',
        );
    });
});
