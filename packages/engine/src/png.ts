import zlib from 'node:zlib';

/**
 * PNG encoding, from Node's own zlib.
 *
 * This CanvasKit build ships no wasm image encoders — `encodeToBytes()` returns
 * null — so the host has to encode, exactly as the browser backend does through
 * a 2D canvas. PNG is simple enough (a zlib stream of filtered scanlines in a
 * few CRC'd chunks) that writing it here is cheaper than taking on a native
 * image dependency that would then need prebuilt binaries for every deployment
 * target this is meant to run on.
 */

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/** One PNG chunk: length, type, payload, CRC over type+payload. */
function chunk(type: string, payload: Uint8Array): Buffer {
    const out = Buffer.alloc(payload.length + 12);
    out.writeUInt32BE(payload.length, 0);
    out.write(type, 4, 'ascii');
    Buffer.from(payload).copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + payload.length)), 8 + payload.length);
    return out;
}

/**
 * Encode unpremultiplied RGBA8888 pixels — the layout `snapshotPixels()`
 * produces — as a PNG.
 *
 * Every scanline uses filter 0 (None). Filtering exists to help the deflate
 * stream, and the adaptive heuristics that choose per-row filters cost more time
 * than they save on the flat, large-area output a motion-graphics frame usually
 * is. `level` trades encode time against size if that turns out to matter.
 */
export function encodePng(
    pixels: Uint8Array,
    width: number,
    height: number,
    level: number = zlib.constants.Z_DEFAULT_COMPRESSION,
): Uint8Array {
    const stride = width * 4;
    const expected = stride * height;
    if (pixels.length < expected) {
        throw new RangeError(
            `PNG encode needs ${expected} bytes for ${width}×${height} RGBA, got ${pixels.length}.`,
        );
    }

    // Each row is prefixed with its filter byte, so the raw stream is
    // height × (1 + stride) bytes before deflating.
    const raw = Buffer.alloc(height * (stride + 1));
    for (let y = 0; y < height; y++) {
        const to = y * (stride + 1);
        raw[to] = 0;
        Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(raw, to + 1);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // colour type 6 = truecolour with alpha
    ihdr[10] = 0;  // deflate
    ihdr[11] = 0;  // adaptive filtering
    ihdr[12] = 0;  // no interlace

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level })),
        chunk('IEND', new Uint8Array(0)),
    ]);
}
